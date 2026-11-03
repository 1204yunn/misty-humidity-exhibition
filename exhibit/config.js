// Review and deploy the trusted backend BEFORE enabling. No credentials belong here.
export const exhibitConfig = Object.freeze({
  enabled: false,
  pendingEnabled: false, // Enable ONLY after reviewing/applying the exhibit pending Rules draft.
  endpoint: '', // HTTPS URL of exhibitPublish; no user-selectable URL/query parameter.
});