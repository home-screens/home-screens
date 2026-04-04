'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { ChoreMember } from '@/types/config';
import type { RewardDefinition, RewardRedemption } from '@/lib/reward-data';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import ConfirmSheet from './ConfirmSheet';
import RewardFormOverlay from './RewardFormOverlay';

// ── Types ────────────────────────────────────────────────────────────

interface RewardsData {
  rewards: RewardDefinition[];
  balances: Record<string, number>;
  redemptions: RewardRedemption[];
}

interface RewardsViewProps {
  members: ChoreMember[];
  accentColor: string;
  isAdmin?: boolean;
}

type InnerView = 'redeem' | 'rewards' | 'balances' | 'history';

// ── Helpers ──────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

// ── Component ────────────────────────────────────────────────────────

export default function RewardsView({ members, accentColor, isAdmin = false }: RewardsViewProps) {
  const [data, setData] = useState<RewardsData | null>(null);
  const [innerView, setInnerView] = useState<InnerView>('redeem');
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '');
  const [editingReward, setEditingReward] = useState<RewardDefinition | 'new' | null>(null);
  const [redeemTarget, setRedeemTarget] = useState<{ reward: RewardDefinition; memberId: string } | null>(null);
  const [adjusting, setAdjusting] = useState<Set<string>>(new Set());

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/rewards');
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Derived ──
  const selectedMember = members.find((m) => m.id === selectedMemberId);
  const selectedColor = selectedMember?.color ?? accentColor;
  const balance = data?.balances[selectedMemberId] ?? 0;

  const availableRewards = useMemo(() => {
    if (!data) return [];
    return data.rewards
      .filter((r) => r.enabled)
      .filter((r) => r.memberIds.length === 0 || r.memberIds.includes(selectedMemberId));
  }, [data, selectedMemberId]);

  const sortedRedemptions = useMemo(() => {
    if (!data) return [];
    return [...data.redemptions].sort(
      (a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime(),
    );
  }, [data]);

  // Map memberId → color for history dots
  const memberColorMap = useMemo(
    () => new Map(members.map((m) => [m.id, m.color])),
    [members],
  );

  // ── Handlers ──
  const handleRedeem = async () => {
    if (!redeemTarget) return;
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: redeemTarget.reward.id, memberId: redeemTarget.memberId }),
      });
      if (res.ok) {
        const result = await res.json();
        setData((prev) => prev ? { ...prev, balances: result.balances, redemptions: result.redemptions } : prev);
      } else {
        // Balance may have changed — refresh so the user sees the real state
        await fetchData();
      }
    } catch {
      await fetchData();
    }
    setRedeemTarget(null);
  };

  const handleSaveReward = async (reward: RewardDefinition) => {
    const existing = data?.rewards ?? [];
    const updated = editingReward === 'new'
      ? [...existing, reward]
      : existing.map((r) => (r.id === reward.id ? reward : r));
    setData((prev) => ({ rewards: updated, balances: prev?.balances ?? {}, redemptions: prev?.redemptions ?? [] }));
    setEditingReward(null);
    try {
      await fetch('/api/rewards/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewards: updated }),
      });
    } catch { /* silent */ }
  };

  const handleDeleteReward = async (id: string) => {
    const updated = (data?.rewards ?? []).filter((r) => r.id !== id);
    setData((prev) => ({ rewards: updated, balances: prev?.balances ?? {}, redemptions: prev?.redemptions ?? [] }));
    setEditingReward(null);
    try {
      await fetch('/api/rewards/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewards: updated }),
      });
    } catch { /* silent */ }
  };

  const handleAdjust = async (memberId: string, amount: number) => {
    if (adjusting.has(memberId)) return;
    setAdjusting((prev) => new Set(prev).add(memberId));
    const snapshot = data;
    // Optimistic
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        balances: {
          ...prev.balances,
          [memberId]: Math.max(0, (prev.balances[memberId] ?? 0) + amount),
        },
      };
    });
    try {
      const res = await fetch('/api/rewards/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, amount }),
      });
      if (res.ok) {
        const result = await res.json();
        setData((prev) => prev ? { ...prev, balances: result.balances } : prev);
      } else {
        setData(snapshot);
      }
    } catch {
      setData(snapshot);
    }
    setAdjusting((prev) => {
      const next = new Set(prev);
      next.delete(memberId);
      return next;
    });
  };

  // ── Inner nav colors ──
  const viewColors: Record<InnerView, string> = {
    redeem: selectedColor,
    rewards: '#f59e0b',
    balances: '#4ade80',
    history: '#a78bfa',
  };

  // ── Render ──
  return (
    <div>
      {/* Inner toggle: Redeem / Manage / History */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, padding: '0 2px' }}>
        {(isAdmin ? ['redeem', 'rewards', 'balances', 'history'] as InnerView[] : ['redeem', 'history'] as InnerView[]).map((v) => (
          <button
            key={v}
            onClick={() => setInnerView(v)}
            style={{
              fontSize: 13,
              fontWeight: innerView === v ? 600 : 500,
              color: innerView === v ? viewColors[v] : '#525252',
              paddingBottom: 4,
              cursor: 'pointer',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottomStyle: 'solid',
              borderBottomWidth: 2,
              borderBottomColor: innerView === v ? viewColors[v] : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {innerView === 'redeem' && (
        <RedeemSection
          members={members}
          selectedMemberId={selectedMemberId}
          onSelectMember={setSelectedMemberId}
          balance={balance}
          selectedColor={selectedColor}
          rewards={availableRewards}
          onRedeem={(reward) => setRedeemTarget({ reward, memberId: selectedMemberId })}
        />
      )}

      {innerView === 'rewards' && (
        <RewardsManageSection
          data={data}
          onEditReward={setEditingReward}
        />
      )}

      {innerView === 'balances' && (
        <BalancesSection
          data={data}
          members={members}
          onAdjust={handleAdjust}
        />
      )}

      {innerView === 'history' && (
        <HistorySection
          redemptions={sortedRedemptions}
          memberColorMap={memberColorMap}
        />
      )}

      {/* Confirm redeem sheet */}
      {redeemTarget && (
        <ConfirmSheet
          icon={
            <div style={{ width: 56, height: 56, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${selectedColor} 12%, transparent)` }}>
              <ChoreIcon value={redeemTarget.reward.emoji} size={28} color={selectedColor} />
            </div>
          }
          title={`Redeem ${redeemTarget.reward.name}?`}
          description={`This will use ${redeemTarget.reward.cost} points from ${selectedMember?.name ?? 'this member'}'s balance. Remaining: ${Math.max(0, balance - redeemTarget.reward.cost)} pts`}
          confirmLabel={`Redeem — ${redeemTarget.reward.cost} pts`}
          confirmColor={selectedColor}
          onConfirm={handleRedeem}
          onCancel={() => setRedeemTarget(null)}
        />
      )}

      {/* Reward form overlay */}
      {editingReward !== null && (
        <RewardFormOverlay
          reward={editingReward === 'new' ? null : editingReward}
          members={members}
          onSave={handleSaveReward}
          onDelete={editingReward !== 'new' ? handleDeleteReward : undefined}
          onBack={() => setEditingReward(null)}
        />
      )}
    </div>
  );
}

// ── Redeem Section ───────────────────────────────────────────────────

function RedeemSection({
  members,
  selectedMemberId,
  onSelectMember,
  balance,
  selectedColor,
  rewards,
  onRedeem,
}: {
  members: ChoreMember[];
  selectedMemberId: string;
  onSelectMember: (id: string) => void;
  balance: number;
  selectedColor: string;
  rewards: RewardDefinition[];
  onRedeem: (reward: RewardDefinition) => void;
}) {
  return (
    <>
      {/* Member pills */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 0', overflowX: 'auto', scrollbarWidth: 'none' as const }}>
        {members.map((member) => {
          const isActive = member.id === selectedMemberId;
          return (
            <button
              key={member.id}
              className="press-scale"
              onClick={() => onSelectMember(member.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                minHeight: 44,
                borderRadius: 999,
                border: `2px solid ${isActive ? member.color : 'transparent'}`,
                background: isActive ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'rgba(255,255,255,0.05)',
                color: isActive ? member.color : 'rgba(255,255,255,0.6)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap' as const,
                transition: 'all 0.15s',
              }}
            >
              {member.emoji ? (
                <ChoreIcon value={member.emoji} size={18} color={isActive ? member.color : 'rgba(255,255,255,0.6)'} />
              ) : (
                <span style={{ fontSize: 16, fontWeight: 600 }}>{member.name[0]}</span>
              )}
              <span>{member.name}</span>
            </button>
          );
        })}
      </div>

      {/* Balance card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 20,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 16,
          marginBottom: 16,
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: selectedColor }}>
            {balance}
          </div>
          <div style={{ fontSize: 12, color: '#737373', fontWeight: 500, marginTop: 4 }}>
            points available
          </div>
        </div>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            background: `color-mix(in srgb, ${selectedColor} 12%, transparent)`,
          }}
        >
          🎟️
        </div>
      </div>

      {/* Available Rewards */}
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#525252', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>🎟️</span>
        Available Rewards
      </div>

      {rewards.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#525252', fontSize: 14 }}>
          No rewards set up yet
        </div>
      )}

      {rewards.map((reward) => {
        const canAfford = balance >= reward.cost;
        return (
          <button
            key={reward.id}
            className="press-scale"
            onClick={() => canAfford && onRedeem(reward)}
            disabled={!canAfford}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 12,
              marginBottom: 6,
              border: 'none',
              width: '100%',
              textAlign: 'left' as const,
              cursor: canAfford ? 'pointer' : 'not-allowed',
              opacity: canAfford ? 1 : 0.4,
              transition: 'all 0.15s',
              color: 'inherit',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: `color-mix(in srgb, ${selectedColor} 12%, transparent)`,
              }}
            >
              <ChoreIcon value={reward.emoji} size={20} color={selectedColor} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#e5e5e5' }}>{reward.name}</div>
              {reward.description && (
                <div style={{ fontSize: 12, color: '#737373', marginTop: 1 }}>{reward.description}</div>
              )}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: 999,
                flexShrink: 0,
                whiteSpace: 'nowrap' as const,
                background: canAfford ? `color-mix(in srgb, ${selectedColor} 15%, transparent)` : 'rgba(255,255,255,0.06)',
                color: canAfford ? selectedColor : '#525252',
              }}
            >
              {reward.cost} pts
            </div>
          </button>
        );
      })}
    </>
  );
}

// ── Manage Section ───────────────────────────────────────────────────

function RewardsManageSection({
  data,
  onEditReward,
}: {
  data: RewardsData | null;
  onEditReward: (reward: RewardDefinition | 'new') => void;
}) {
  const rewards = data?.rewards ?? [];

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#525252', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <ChoreIcon value="lucide:gem" bare size={14} color="#a78bfa" />
        Rewards
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#333', fontWeight: 500, textTransform: 'none' as const, letterSpacing: 0 }}>
          {rewards.length} reward{rewards.length !== 1 ? 's' : ''}
        </span>
      </div>

      {rewards.map((reward) => (
        <button
          key={reward.id}
          className="press-scale"
          onClick={() => onEditReward(reward)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            marginBottom: 6,
            cursor: 'pointer',
            width: '100%',
            border: 'none',
            textAlign: 'left' as const,
            opacity: reward.enabled ? 1 : 0.4,
            color: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ChoreIcon value={reward.emoji} size={18} color="#a3a3a3" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e5e5e5' }}>{reward.name}</div>
            <div style={{ fontSize: 12, color: '#525252', marginTop: 1 }}>
              {reward.cost} pts · {reward.memberIds.length === 0 ? 'Everyone' : reward.enabled ? `${reward.memberIds.length} member${reward.memberIds.length !== 1 ? 's' : ''}` : 'Disabled'}
            </div>
          </div>
          <div style={{ color: '#333', fontSize: 18 }}>›</div>
        </button>
      ))}

      <button
        className="press-scale"
        onClick={() => onEditReward('new')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '14px 16px',
          minHeight: 48,
          borderRadius: 12,
          border: '2px dashed #2a2a2a',
          background: 'transparent',
          color: '#525252',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          width: '100%',
          marginTop: 4,
        }}
      >
        <Plus size={18} /> Add Reward
      </button>
    </>
  );
}

// ── Balances Section ─────────────────────────────────────────────────

function BalancesSection({
  data,
  members,
  onAdjust,
}: {
  data: RewardsData | null;
  members: ChoreMember[];
  onAdjust: (memberId: string, amount: number) => void;
}) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#525252', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <ChoreIcon value="lucide:gem" bare size={14} color="#a78bfa" />
        Point Balances
      </div>

      {members.map((member) => (
        <div
          key={member.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: member.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: 'white',
              flexShrink: 0,
              fontWeight: 700,
            }}
          >
            {member.name[0]}
          </div>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#e5e5e5' }}>
            {member.name}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#a3a3a3', marginRight: 8 }}>
            {data?.balances[member.id] ?? 0} pts
          </div>
          <button
            className="press-scale-xs"
            onClick={() => onAdjust(member.id, -1)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #2a2a2a',
              background: '#1a1a1a',
              color: '#a3a3a3',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Minus size={16} />
          </button>
          <button
            className="press-scale-xs"
            onClick={() => onAdjust(member.id, 1)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #2a2a2a',
              background: '#1a1a1a',
              color: '#a3a3a3',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={16} />
          </button>
        </div>
      ))}
    </>
  );
}

// ── History Section ──────────────────────────────────────────────────

function HistorySection({
  redemptions,
  memberColorMap,
}: {
  redemptions: RewardRedemption[];
  memberColorMap: Map<string, string>;
}) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#525252', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>📜</span>
        Recent Redemptions
      </div>

      {redemptions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#525252', fontSize: 14 }}>
          No redemptions yet
        </div>
      )}

      {redemptions.map((r) => (
        <div
          key={r.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            fontSize: 13,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: memberColorMap.get(r.memberId) ?? '#525252',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, color: '#a3a3a3' }}>
            <strong style={{ color: '#e5e5e5', fontWeight: 500 }}>{r.memberName}</strong>
            {' redeemed '}
            <strong style={{ color: '#e5e5e5', fontWeight: 500 }}>{r.rewardName}</strong>
            {' — '}{r.cost} pts
          </div>
          <div style={{ fontSize: 11, color: '#525252', flexShrink: 0 }}>
            {relativeTime(r.redeemedAt)}
          </div>
        </div>
      ))}
    </>
  );
}
