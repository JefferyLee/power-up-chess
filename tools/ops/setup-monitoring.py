# One-time Cloud Monitoring setup for power-up-chess-dev: an e-mail
# notification channel, an uptime check on https://app.powerupcastle.app/
# and three alert policies (uptime fails, Cloud Functions 5xx rate, ERROR
# log rate). Re-running creates duplicates, so delete the old objects in
# Monitoring first. Needs `gcloud auth application-default login` as a
# project owner. See docs/OPS_RUNBOOK.md.
#
#   python3 -I tools/ops/setup-monitoring.py you@example.com
import json, subprocess, sys, urllib.request

if len(sys.argv) != 2 or '@' not in sys.argv[1]:
    sys.exit('usage: python3 -I tools/ops/setup-monitoring.py <alert e-mail>')
EMAIL = sys.argv[1]
P = 'power-up-chess-dev'
TOKEN = subprocess.check_output(['gcloud', 'auth', 'application-default', 'print-access-token'], text=True).strip()
M = f'https://monitoring.googleapis.com/v3/projects/{P}'
RUNBOOK = 'See docs/OPS_RUNBOOK.md in JefferyLee/power-up-chess. Operator: castle-op.'


def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json',
                                          'x-goog-user-project': P})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'body': e.read().decode()[:400]}


def policy(name, doc, cond):
    r = call('POST', f'{M}/alertPolicies', {
        'displayName': name, 'combiner': 'OR', 'enabled': True,
        'notificationChannels': [CH] if CH else [],
        'documentation': {'content': doc + '\n' + RUNBOOK, 'mimeType': 'text/markdown'},
        'conditions': [cond]})
    print('policy:', r.get('name') or r)


ch = call('POST', f'{M}/notificationChannels',
          {'type': 'email', 'displayName': 'Ops e-mail', 'labels': {'email_address': EMAIL}})
print('channel:', ch.get('name') or ch)
CH = ch.get('name')

up = call('POST', f'{M}/uptimeCheckConfigs', {
    'displayName': 'app.powerupcastle.app index',
    'monitoredResource': {'type': 'uptime_url', 'labels': {'project_id': P, 'host': 'app.powerupcastle.app'}},
    'httpCheck': {'path': '/', 'port': 443, 'useSsl': True, 'validateSsl': True, 'requestMethod': 'GET'},
    'contentMatchers': [{'content': 'id="root"', 'matcher': 'CONTAINS_STRING'}],
    'period': '300s', 'timeout': '10s'})
print('uptime:', up.get('name') or up)
UP_ID = (up.get('name') or '').split('/')[-1]

if UP_ID:
    policy('[PUC] app.powerupcastle.app down (uptime check)',
           'The uptime check on https://app.powerupcastle.app/ failed from 2+ regions for 5 min.',
           {'displayName': 'uptime check fails', 'conditionThreshold': {
               'filter': f'metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.type="uptime_url" AND metric.label.check_id="{UP_ID}"',
               'aggregations': [{'alignmentPeriod': '300s', 'perSeriesAligner': 'ALIGN_NEXT_OLDER',
                                 'crossSeriesReducer': 'REDUCE_COUNT_FALSE', 'groupByFields': ['resource.label.*']}],
               'comparison': 'COMPARISON_GT', 'thresholdValue': 1, 'duration': '300s', 'trigger': {'count': 1}}})
policy('[PUC] Cloud Functions 5xx',
       'Cloud Run (Firebase Functions v2) answered 5xx at more than ~6 requests per 5 min. Run tools/ops/status.sh.',
       {'displayName': '5xx rate', 'conditionThreshold': {
           'filter': 'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision" AND metric.label.response_code_class="5xx"',
           'aggregations': [{'alignmentPeriod': '300s', 'perSeriesAligner': 'ALIGN_RATE', 'crossSeriesReducer': 'REDUCE_SUM'}],
           'comparison': 'COMPARISON_GT', 'thresholdValue': 0.02, 'duration': '300s', 'trigger': {'count': 1}}})
policy('[PUC] Cloud Functions error logs',
       'More than ~10 ERROR-severity log entries from the functions in 10 min (a crashing callable or scheduled job). Run tools/ops/status.sh.',
       {'displayName': 'error log rate', 'conditionThreshold': {
           'filter': 'metric.type="logging.googleapis.com/log_entry_count" AND resource.type="cloud_run_revision" AND metric.label.severity="ERROR"',
           'aggregations': [{'alignmentPeriod': '600s', 'perSeriesAligner': 'ALIGN_RATE', 'crossSeriesReducer': 'REDUCE_SUM'}],
           'comparison': 'COMPARISON_GT', 'thresholdValue': 0.0167, 'duration': '600s', 'trigger': {'count': 1}}})
