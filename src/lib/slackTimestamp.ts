const SLACK_TIMESTAMP = /^[1-9]\d*\.\d+$/;

export function isSlackTimestamp(value: string): boolean {
  return SLACK_TIMESTAMP.test(value) && Number.isFinite(Number(value));
}
