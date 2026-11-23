/**
 * A fetch that can only connect to an address it has just checked.
 *
 * The address checks in `url-safety.ts` resolve a name and judge the answer,
 * but a plain fetch then resolves the name again to connect, and the second
 * answer is whatever the name's DNS chooses to say that time (DNS
 * rebinding). Here the connection's own lookup is `checkedLookup`, so there
 * is one answer: the one that was checked is the one that is dialled.
 *
 * This is undici's own `fetch` with undici's own `Agent`, both from the
 * `undici` package, not Node's built-in fetch handed a dispatcher. Node
 * bundles its own copy of undici (6 in Node 22, 7 in Node 24 and up) and
 * offers no way to build an agent for it, and an agent from one copy driving
 * the fetch of another only works while the two happen to agree.
 *
 * In its own file so a test of the callers can stand in for the network by
 * replacing this one function.
 */

import { Agent, fetch as undiciFetch } from 'undici';
import { checkedLookup, type AddressRule } from '@/lib/url-safety';

// One agent per rule, never shared: connections are kept and reused by
// site, and one opened under the home-network rule must not serve a request
// that is held to the public rule.
const agents = new Map<AddressRule, Agent>();

function agentFor(rule: AddressRule): Agent {
  let agent = agents.get(rule);
  if (!agent) {
    agent = new Agent({ connect: { lookup: checkedLookup(rule) } });
    agents.set(rule, agent);
  }
  return agent;
}

/**
 * The fetch for a URL someone else chose. Pass it as `fetchImpl` to
 * `fetchWithTimeout`. A name that resolves to an address the rule forbids
 * fails like any connection error; `isAddressBlockedError` tells it apart.
 *
 * Still follow redirects by hand (`redirect: 'manual'`) and check each hop's
 * host first: this guards the address, not which sites may be reached.
 */
export function addressCheckedFetch(rule: AddressRule): typeof fetch {
  const dispatcher = agentFor(rule);
  return ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
    undiciFetch(input, { ...init, dispatcher })) as unknown as typeof fetch;
}

/** Close every kept connection, so a test's server can shut down. */
export async function __closePinnedFetchForTests(): Promise<void> {
  const open = [...agents.values()];
  agents.clear();
  await Promise.all(open.map((agent) => agent.destroy()));
}
