import { cloud } from "./client";

export type ConnectorApprovalPreference = {
  autoApproveMutations: boolean;
};

export function getConnectorApprovalPreference() {
  return cloud.json<ConnectorApprovalPreference>(
    "/v2/connectors/approval-preferences",
  );
}

export function setConnectorApprovalPreference(autoApproveMutations: boolean) {
  return cloud.json<ConnectorApprovalPreference>(
    "/v2/connectors/approval-preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoApproveMutations }),
    },
  );
}

export function executeConnectorApproval(token: string) {
  return cloud.json<{ ok: true; output: unknown }>(
    `/v2/connectors/approvals/${encodeURIComponent(token)}/execute`,
    { method: "POST" },
  );
}

export function declineConnectorApproval(token: string) {
  return cloud.json<{ ok: true }>(
    `/v2/connectors/approvals/${encodeURIComponent(token)}/decline`,
    { method: "POST" },
  );
}
