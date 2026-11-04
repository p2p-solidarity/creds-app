import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useProfileSnapshotStore } from '@/people/profileSnapshots';
import { syncPrivateInbox } from '@/privateExchange/inbox';
import {
  usePrivateExchangeStore,
  type ContactShareDraft,
  type IncomingCredentialRequest,
  type IncomingPassportRequest,
  type OutgoingCredentialRequest,
  type OutgoingPassportRequest,
  type ReceivedContactShare,
} from '@/privateExchange/store';

export type InboxSyncState = 'idle' | 'syncing' | 'noKey' | 'unreachable';

/** Sync the private inbox whenever the calling screen gains focus. */
export function usePrivateInboxSync(): InboxSyncState {
  const [state, setState] = useState<InboxSyncState>('idle');
  useFocusEffect(
    useCallback(() => {
      let live = true;
      setState('syncing');
      void syncPrivateInbox()
        .then((result) => {
          if (!live) return;
          if (result.kind === 'noKey') setState('noKey');
          else setState(result.confirmed ? 'idle' : 'unreachable');
        })
        .catch(() => {
          if (live) setState('unreachable');
        });
      return () => {
        live = false;
      };
    }, [])
  );
  return state;
}

function useHydrated(): void {
  const hydrate = usePrivateExchangeStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}

/** Pending, unexpired requests sent to me, newest first. */
export function usePendingIncoming(): readonly IncomingPassportRequest[] {
  useHydrated();
  const incoming = usePrivateExchangeStore((s) => s.incoming);
  return useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return Object.values(incoming)
      .filter((r) => r.status === 'pending' && r.exp > now)
      .sort((a, b) => b.receivedAt - a.receivedAt);
  }, [incoming]);
}

export function useIncomingRequest(id: string): IncomingPassportRequest | undefined {
  useHydrated();
  return usePrivateExchangeStore((s) => s.incoming[id]);
}

/** Requests I sent to `did`, newest first. */
export function useOutgoingFor(did: string): readonly OutgoingPassportRequest[] {
  useHydrated();
  const outgoing = usePrivateExchangeStore((s) => s.outgoing);
  return useMemo(
    () => Object.values(outgoing).filter((r) => r.recipientDid === did).sort((a, b) => b.sentAt - a.sentAt),
    [outgoing, did]
  );
}

/** The latest details `did` shared with me privately. */
export function useContactShareFrom(did: string): ReceivedContactShare | undefined {
  useHydrated();
  return usePrivateExchangeStore((s) => s.contacts[did]);
}

/** Shares from people not saved in my People: they wait in the inbox. */
export function useUnsavedContactShares(): readonly ReceivedContactShare[] {
  useHydrated();
  const contacts = usePrivateExchangeStore((s) => s.contacts);
  const snapshots = useProfileSnapshotStore((s) => s.snapshots);
  return useMemo(() => {
    const saved = new Set<string>();
    for (const snapshot of snapshots.values()) if (snapshot.kind === 'verified') saved.add(snapshot.did);
    return Object.values(contacts)
      .filter((c) => !saved.has(c.senderDid))
      .sort((a, b) => b.sharedAt - a.sharedAt);
  }, [contacts, snapshots]);
}

export function useContactShareDraft(): ContactShareDraft | null {
  useHydrated();
  return usePrivateExchangeStore((s) => s.contactDraft);
}

/** Unix s I last shared my details with `did`, if ever. */
export function useContactSentAt(did: string): number | undefined {
  useHydrated();
  return usePrivateExchangeStore((s) => s.contactsSent[did]);
}

/** Pending, unexpired credential requests sent to me, newest first. */
export function usePendingCredentialIncoming(): readonly IncomingCredentialRequest[] {
  useHydrated();
  const incoming = usePrivateExchangeStore((s) => s.credentialIncoming);
  return useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return Object.values(incoming)
      .filter((r) => r.status === 'pending' && r.exp > now)
      .sort((a, b) => b.receivedAt - a.receivedAt);
  }, [incoming]);
}

/** Credential requests I sent to `did`, newest first. */
export function useCredentialOutgoingFor(did: string): readonly OutgoingCredentialRequest[] {
  useHydrated();
  const outgoing = usePrivateExchangeStore((s) => s.credentialOutgoing);
  return useMemo(
    () => Object.values(outgoing).filter((r) => r.recipientDid === did).sort((a, b) => b.sentAt - a.sentAt),
    [outgoing, did]
  );
}
