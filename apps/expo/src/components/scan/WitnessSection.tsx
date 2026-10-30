/**
 * Someone else's Page, checked by this phone (docs/ref/10 §3.11 tiers 3–4).
 * For each link the Page claims, this phone fetches the public profile itself
 * and shows "your phone just checked"; it also shows how many other phones
 * witnessed it. 「幫他見證」 publishes a witness — only on tap, because a
 * witness is a public "I know this person".
 *
 * Renders rows for the card `VerifiedProfileView` opens with (under the
 * signature row): one line per link, a tick when this phone found it.
 *
 * Every row is loading / ready / error (Rule 8): the rows paint at once as
 * "checking", no count is shown until every relay answered, and a failed
 * check says so rather than showing a stale tick.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { BrandIcon } from '@/components/icons/BrandIcon';
import type { BrandIconName } from '@/components/icons/brandGlyphs';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { DEFAULT_RELAYS } from '@/nostr/publish';
import { getNostrPubkey, npubDecode } from '@/nostr/userKey';
import { countPassportHolders } from '@/passport/npubBinding';
import { deviceAttestSupported } from '@/witness/deviceKey';
import { myWitnessAt, rememberMyWitness } from '@/witness/myWitnesses';
import {
  checkOnThisPhone,
  createWitness,
  fetchWitnessEvents,
  publishWitness,
  resolveCredsName,
  summarizeWitnessEvents,
} from '@/witness/witness';
import { socialTargetForClaim, type ProfileRecord, type SocialTarget, type WitnessSummary } from '@solidarity/shared';

type Check = 'checking' | 'found' | 'missing' | 'unreachable';
type Load<T> = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly value: T } | { readonly kind: 'error' };

interface PageIdentity {
  readonly subject: string;
  readonly subjectHex: string;
  readonly name: string;
  readonly mine: boolean;
  /** This phone's npub (hex), to spot its own witness among the relays'. */
  readonly meHex: string | null;
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
  const [passports, setPassports] = useState<Load<number>>({ kind: 'loading' });
  const claimKey = claims.map((c) => c.claim).join('|');

  useEffect(() => {
    let live = true;
    const subject = record.alsoKnownAs.find((a) => a.startsWith('nostr:npub1'))?.slice('nostr:'.length);
    const subjectHex = subject === undefined ? null : npubDecode(subject);
    if (subject === undefined || subjectHex?.ok !== true || claims.length === 0) {
      setIdentity({ kind: 'ready', value: null });
      return;
    }
    const claimList = claims.map((c) => c.claim);
    // Witness events need no name: fetch them alongside the name lookup.
    const witnessEvents = fetchWitnessEvents(subjectHex.value, claimList, DEFAULT_RELAYS);
    void (async () => {
      const [name, meHex] = await Promise.all([
        resolveCredsName(subjectHex.value, DEFAULT_RELAYS),
        getNostrPubkey().then((p) => (p.ok ? p.value : null)),
      ]);
      const mine = meHex === subjectHex.value;
      if (!live) return;
      if (name === null) {
        setIdentity({ kind: 'error' });
        return;
      }
      const page = { subject, subjectHex: subjectHex.value, name, mine, meHex };
      setIdentity({ kind: 'ready', value: page });
      setChecks(Object.fromEntries(claims.map((c) => [c.claim, 'checking' as const])));
      void witnessEvents
        .then(async (events) => {
          const s = summarizeWitnessEvents(events, { ...page, claims: claimList });
          if (!live) return;
          setSummaries({ kind: 'ready', value: s });
          const authors = new Set<string>();
          for (const summary of s.values()) {
            for (const w of summary.others) {
              const hex = npubDecode(w.statement.witness);
              if (hex.ok) authors.add(hex.value);
            }
          }
          const count = await countPassportHolders([...authors], DEFAULT_RELAYS);
          if (live) setPassports({ kind: 'ready', value: count });
        })
        .catch(() => {
          if (!live) return;
          setSummaries((prev) => (prev.kind === 'ready' ? prev : { kind: 'error' }));
          setPassports({ kind: 'error' });
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
  if (identity.kind === 'error' || (identity.kind === 'ready' && identity.value === null)) {
    return <CardNote text={t('witness.noName')} />;
  }
  // While the name resolves, the rows are already on screen, each still checking.
  const page = identity.kind === 'ready' ? identity.value : null;
  const canWitness = page !== null && !page.mine && deviceAttestSupported();

  const witness = async (claim: string, target: SocialTarget) => {
    if (page === null) return;
    setWitnessing(claim);
    const event = await createWitness(target, page.name, page.subject);
    if (!event.ok) {
      setWitnessing(null);
      pushToast(t(`zktls.error.${event.error === 'noNostrKey' ? 'noNostrKey' : event.error}`, { platform: target.platform }), 'error');
      return;
    }
    const report = await publishWitness(event.value, DEFAULT_RELAYS);
    setWitnessing(null);
    if (report.success) {
      rememberMyWitness(claim, page.subjectHex, event.value.created_at);
      setWitnessed((prev) => new Set(prev).add(claim));
    }
    pushToast(t(report.success ? 'witness.published' : 'zktls.publishPending'), report.success ? 'success' : 'error');
  };

  const offered: string[] = [];
  const rows = claims.map(({ claim, target }) => {
    const check = checks[claim] ?? 'checking';
    const summary = summaries.kind === 'ready' ? summaries.value.get(claim) : undefined;
    // The relays may already hold this phone's witness (an earlier visit):
    // count it once, and don't offer to sign it again until it lapses.
    const mineOnRelays =
      page?.meHex != null &&
      (summary?.others.some((w) => {
        const hex = npubDecode(w.statement.witness);
        return hex.ok && hex.value === page.meHex;
      }) ?? false);
    const others = (summary?.others.length ?? 0) + (witnessed.has(claim) && !mineOnRelays ? 1 : 0);
    const alreadyWitnessed =
      witnessed.has(claim) || mineOnRelays || (page !== null && myWitnessAt(claim, page.subjectHex) !== null);
    const canOffer = canWitness && check === 'found' && !alreadyWitnessed;
    if (canOffer) offered.push(claim);
    // One quiet line under the handle: what this phone found, then how many
    // phones witnessed it — only once every relay answered (Rule 8).
    const detail = [
      check === 'checking'
        ? t('witness.checking')
        : check === 'missing'
          ? t('witness.missing')
          : check === 'unreachable'
            ? t('witness.unreachable')
            : null,
      summaries.kind === 'ready' && others > 0 ? t('witness.count', { count: others }) : null,
      canWitness && alreadyWitnessed ? t('witness.youWitnessed') : null,
    ].filter((part): part is string => part !== null).join(' · ');
    return (
      <View key={claim} className="flex-row items-center gap-3 px-4 py-3" style={{ borderTopWidth: 0.5, borderTopColor: Colors.divider }}>
        <BrandIcon name={PLATFORM_BRAND[target.platform]} size={18} color={Colors.text2} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <ThemedText variant="bodyMedium" numberOfLines={1}>
            {target.platform === 'website' ? target.handle : `@${target.handle}`}
          </ThemedText>
          {detail.length > 0 ? (
            <ThemedText variant="caption" tone={check === 'missing' || check === 'unreachable' ? 'error' : 'tertiary'} numberOfLines={1}>
              {detail}
            </ThemedText>
          ) : null}
        </View>
        {canOffer ? (
          <ThemedButton
            label={t('witness.actionShort')}
            variant="secondary"
            size="sm"
            loading={witnessing === claim}
            accessibilityLabel={t('witness.action', { handle: target.platform === 'website' ? target.handle : `@${target.handle}` })}
            onPress={() => {
              void witness(claim, target);
            }}
          />
        ) : check === 'found' ? (
          <View accessible accessibilityLabel={t('witness.checkedHere')}>
            <SfIcon name="checkmark.circle.fill" size={18} color={Colors.terminalGreen} />
          </View>
        ) : null}
      </View>
    );
  });

  return (
    <>
      {rows}
      {passports.kind === 'ready' && passports.value > 0 ? (
        <CardNote text={t('witness.passportCount', { count: passports.value })} />
      ) : null}
      {offered.length > 0 ? <CardNote text={t('witness.publicNote')} /> : null}
    </>
  );
}

const PLATFORM_BRAND: Readonly<Record<SocialTarget['platform'], BrandIconName>> = {
  x: 'x',
  github: 'github',
  telegram: 'telegram',
  website: 'globe',
};

function CardNote({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="px-4 py-3" style={{ borderTopWidth: 0.5, borderTopColor: Colors.divider }}>
      <ThemedText variant="caption" tone="tertiary">
        {text}
      </ThemedText>
    </View>
  );
}
