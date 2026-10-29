/**
 * Someone else's Page, checked by this phone (docs/ref/10 §3.11 tiers 3–4).
 * For each link the Page claims, this phone fetches the public profile itself
 * and shows "your phone just checked"; it also shows how many other phones
 * witnessed it. 「幫他見證」 publishes a witness — only on tap, because a
 * witness is a public "I know this person".
 *
 * Every row is loading / ready / error (Rule 8): no count is shown until the
 * relays answered, and a failed check says so rather than showing a stale tick.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { SealPill } from '@/components/badges/SealPill';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { DEFAULT_RELAYS } from '@/nostr/publish';
import { getNostrPubkey, npubDecode } from '@/nostr/userKey';
import { deviceAttestSupported } from '@/witness/deviceKey';
import {
  checkOnThisPhone,
  createWitness,
  fetchWitnessSummaries,
  publishWitness,
  resolveCredsName,
} from '@/witness/witness';
import { socialTargetForClaim, type ProfileRecord, type SocialTarget, type WitnessSummary } from '@solidarity/shared';

type Check = 'checking' | 'found' | 'missing' | 'unreachable';
type Load<T> = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly value: T } | { readonly kind: 'error' };

interface PageIdentity {
  readonly subject: string;
  readonly subjectHex: string;
  readonly name: string;
  readonly mine: boolean;
}

function claimsOf(record: ProfileRecord): { claim: string; target: SocialTarget }[] {
  return record.alsoKnownAs.flatMap((claim) => {
    const target = socialTargetForClaim(claim);
    return target === null ? [] : [{ claim, target }];
  });
}

export function WitnessSection({ record }: { readonly record: ProfileRecord }): ReactNode {
  const { t } = useTranslation();
  const claims = claimsOf(record);
  const [identity, setIdentity] = useState<Load<PageIdentity | null>>({ kind: 'loading' });
  const [summaries, setSummaries] = useState<Load<ReadonlyMap<string, WitnessSummary>>>({ kind: 'loading' });
  const [checks, setChecks] = useState<Readonly<Record<string, Check>>>({});
  const [witnessing, setWitnessing] = useState<string | null>(null);
  const [witnessed, setWitnessed] = useState<ReadonlySet<string>>(new Set());
  const claimKey = claims.map((c) => c.claim).join('|');

  useEffect(() => {
    let live = true;
    const subject = record.alsoKnownAs.find((a) => a.startsWith('nostr:npub1'))?.slice('nostr:'.length);
    const subjectHex = subject === undefined ? null : npubDecode(subject);
    if (subject === undefined || subjectHex?.ok !== true || claims.length === 0) {
      setIdentity({ kind: 'ready', value: null });
      return;
    }
    void (async () => {
      const [name, mine] = await Promise.all([
        resolveCredsName(subjectHex.value, DEFAULT_RELAYS),
        getNostrPubkey().then((p) => p.ok && p.value === subjectHex.value),
      ]);
      if (!live) return;
      if (name === null) {
        setIdentity({ kind: 'error' });
        return;
      }
      const page = { subject, subjectHex: subjectHex.value, name, mine };
      setIdentity({ kind: 'ready', value: page });
      setChecks(Object.fromEntries(claims.map((c) => [c.claim, 'checking' as const])));
      void fetchWitnessSummaries({ ...page, claims: claims.map((c) => c.claim) }, DEFAULT_RELAYS)
        .then((s) => {
          if (live) setSummaries({ kind: 'ready', value: s });
        })
        .catch(() => {
          if (live) setSummaries({ kind: 'error' });
        });
      for (const { claim, target } of claims) {
        void checkOnThisPhone(target, name).then((r) => {
          if (!live) return;
          const state: Check = r.ok ? 'found' : r.error === 'markerMissing' || r.error === 'notFound' ? 'missing' : 'unreachable';
          setChecks((prev) => ({ ...prev, [claim]: state }));
        });
      }
    })();
    return () => {
      live = false;
    };
    // claimKey stands in for `claims` (a fresh array every render).
  }, [claimKey, record.alsoKnownAs]);

  if (claims.length === 0) return null;
  if (identity.kind === 'loading') {
    return (
      <View style={{ paddingVertical: 12 }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (identity.kind === 'error' || identity.value === null) {
    return (
      <ThemedSurface variant="inset" style={{ padding: 12 }}>
        <ThemedText variant="caption" tone="secondary">
          {t('witness.noName')}
        </ThemedText>
      </ThemedSurface>
    );
  }
  const page = identity.value;
  const canWitness = !page.mine && deviceAttestSupported();

  const witness = async (claim: string, target: SocialTarget) => {
    setWitnessing(claim);
    const event = await createWitness(target, page.name, page.subject);
    if (!event.ok) {
      setWitnessing(null);
      pushToast(t(`zktls.error.${event.error === 'noNostrKey' ? 'noNostrKey' : event.error}`, { platform: target.platform }), 'error');
      return;
    }
    const report = await publishWitness(event.value, DEFAULT_RELAYS);
    setWitnessing(null);
    if (report.success) setWitnessed((prev) => new Set(prev).add(claim));
    pushToast(t(report.success ? 'witness.published' : 'zktls.publishPending'), report.success ? 'success' : 'error');
  };

  return (
    <View style={{ gap: 8 }}>
      <ThemedText variant="caption" tone="tertiary">
        {t('witness.header')}
      </ThemedText>
      {claims.map(({ claim, target }) => {
        const check = checks[claim] ?? 'checking';
        const summary = summaries.kind === 'ready' ? summaries.value.get(claim) : undefined;
        const others = (summary?.others.length ?? 0) + (witnessed.has(claim) ? 1 : 0);
        return (
          <ThemedSurface key={claim} variant="outlined" style={{ padding: 12, gap: 8 }}>
            <ThemedText variant="bodyMedium">{target.platform === 'website' ? target.handle : `${target.platform} @${target.handle}`}</ThemedText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {check === 'checking' ? (
                <SealPill state="declared" label={t('witness.checking')} />
              ) : check === 'found' ? (
                <SealPill state="verified" label={t('witness.checkedHere')} />
              ) : (
                <SealPill state="needsRecheck" label={t(check === 'missing' ? 'witness.missing' : 'witness.unreachable')} />
              )}
              {summaries.kind === 'loading' ? null : summaries.kind === 'error' ? (
                <SealPill state="declared" label={t('witness.countUnavailable')} />
              ) : (
                <SealPill state={others > 0 ? 'verified' : 'declared'} label={t('witness.count', { count: others })} />
              )}
              {summary?.self ? <SealPill state="verified" label={t('witness.ownerChecked')} /> : null}
            </View>
            {canWitness && check === 'found' && !witnessed.has(claim) ? (
              <ThemedButton
                label={t('witness.action', { handle: target.platform === 'website' ? target.handle : `@${target.handle}` })}
                variant="secondary"
                size="sm"
                loading={witnessing === claim}
                onPress={() => {
                  void witness(claim, target);
                }}
              />
            ) : null}
          </ThemedSurface>
        );
      })}
      {canWitness ? (
        <ThemedText variant="caption" tone="tertiary">
          {t('witness.publicNote')}
        </ThemedText>
      ) : null}
    </View>
  );
}
