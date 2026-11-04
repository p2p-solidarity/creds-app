import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { syncPrivateInbox } from '@/privateExchange/inbox';
import {
  usePrivateExchangeStore,
  type IncomingPassportRequest,
  type OutgoingPassportRequest,
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
