import { isAuthorized } from "@cedar-policy/cedar-wasm/nodejs";

/**
 * Cedar authorization (stretch #7's stable half), scoped to the Society/RWA
 * feature -- the one place the spec's "who sees what: family, society
 * manager, public totals" three-way split actually exists as a distinct
 * access pattern. Cedar decides policy; the route layer still does identity
 * (matching a presented token against the society's `managerToken`) before
 * calling this -- Cedar was never meant to be a token-verification system,
 * only a policy-decision one.
 */
const POLICIES = `
permit(principal, action == Action::"manageSociety", resource)
  when { principal is SocietyManager && principal == resource };

permit(principal, action == Action::"viewSocietyAggregate", resource)
  when { principal is SocietyManager && principal == resource };

permit(principal, action == Action::"viewOwnHousehold", resource)
  when { principal is Household && principal == resource };

permit(principal, action == Action::"viewPublicImpact", resource)
  when { principal is Public };
`;

export type CedarPrincipalType = "SocietyManager" | "Household" | "Public";
export type CedarAction = "manageSociety" | "viewSocietyAggregate" | "viewOwnHousehold" | "viewPublicImpact";

export interface CedarEntityRef {
  type: CedarPrincipalType;
  id: string;
}

export function authorize(principal: CedarEntityRef, action: CedarAction, resource: CedarEntityRef): boolean {
  const answer = isAuthorized({
    principal: { type: principal.type, id: principal.id },
    action: { type: "Action", id: action },
    resource: { type: resource.type, id: resource.id },
    context: {},
    policies: { staticPolicies: POLICIES },
    entities: [],
  });
  return answer.type === "success" && answer.response.decision === "allow";
}
