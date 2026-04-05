'use client';

import { useState } from 'react';
import { ChevronRight, Plus, Check } from 'lucide-react';
import { uuid } from '@/lib/uuid';
import type {
  ChoreMember,
  ChoreDefinition,
  ChoreResetFrequency,
  ChoreTimeOfDay,
  ChoreRotation,
} from '@/types/config';
import {
  MEMBER_COLORS,
  DAY_NAMES_SHORT,
  TIME_OF_DAY_META,
  cascadeDeleteMember,
} from '@/components/modules/chore-chart/types';
import ChoreIcon, {
  MEMBER_ICONS,
  CHORE_ICONS,
} from '@/components/modules/chore-chart/ChoreIcon';
import { INPUT_STYLE, SELECT_STYLE, LABEL_STYLE } from './chore-form-styles';
import { CHORE_FREQUENCIES, CHORE_ROTATIONS } from '@/lib/chore-constants';
import MobileIconPicker from './MobileIconPicker';
import MobileColorPicker from './MobileColorPicker';
import FormOverlay from './FormOverlay';
import ConfirmSheet from './ConfirmSheet';

// ── MemberFormOverlay ─────────────────────────────────────────────

function MemberFormOverlay({
  initial,
  choreCount,
  onSubmit,
  onDelete,
  onBack,
}: {
  initial?: ChoreMember;
  choreCount?: number;
  onSubmit: (data: Omit<ChoreMember, 'id'>) => void;
  onDelete?: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [color, setColor] = useState(initial?.color ?? MEMBER_COLORS[0]);
  const [showConfirm, setShowConfirm] = useState(false);

  const canSave = name.trim().length > 0;
  const isEdit = !!initial;

  const handleSubmit = () => {
    if (!canSave) return;
    onSubmit({ name: name.trim(), emoji, color });
  };

  return (
    <>
      <FormOverlay title={isEdit ? 'Edit Member' : 'New Member'} onBack={onBack}>
        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>Name</div>
          <input
            type="text"
            placeholder="Enter name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            style={INPUT_STYLE}
            autoFocus
          />
        </div>

        <MobileIconPicker
          value={emoji}
          onChange={setEmoji}
          icons={MEMBER_ICONS}
          label="Avatar"
        />

        <MobileColorPicker value={color} onChange={setColor} />

        <button
          className="press-btn"
          onClick={handleSubmit}
          disabled={!canSave}
          style={{
            width: '100%',
            minHeight: 48,
            padding: 14,
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
            border: 'none',
            cursor: canSave ? 'pointer' : 'default',
            background: canSave ? color : '#525252',
            opacity: canSave ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          {isEdit ? 'Save Member' : 'Add Member'}
        </button>

        {isEdit && onDelete && (
          <button
            className="press-scale"
            onClick={() => setShowConfirm(true)}
            style={{
              width: '100%',
              minHeight: 48,
              padding: 14,
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              background: 'rgba(239,68,68,0.12)',
              color: '#ef4444',
              border: 'none',
              cursor: 'pointer',
              marginTop: 12,
              transition: 'all 0.15s',
            }}
          >
            Delete Member
          </button>
        )}
      </FormOverlay>

      {showConfirm && onDelete && (
        <ConfirmSheet
          title={`Delete "${name}"?`}
          description={`This will remove ${name || 'them'} from${choreCount ? ` all ${choreCount}` : ''} assigned chore${choreCount !== 1 ? 's' : ''}. Chores with no remaining assignees will also be deleted.`}
          confirmLabel="Delete Member"
          onConfirm={() => { onDelete(); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ── ChoreFormOverlay ──────────────────────────────────────────────

function ChoreFormOverlay({
  initial,
  members,
  onSubmit,
  onDelete,
  onBack,
}: {
  initial?: ChoreDefinition;
  members: ChoreMember[];
  onSubmit: (data: Omit<ChoreDefinition, 'id'>) => void;
  onDelete?: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [points, setPoints] = useState(initial?.points?.toString() ?? '1');
  const [frequency, setFrequency] = useState<ChoreResetFrequency>(initial?.frequency ?? 'daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
  const [timeOfDay, setTimeOfDay] = useState<ChoreTimeOfDay>(initial?.timeOfDay ?? 'anytime');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assigneeIds ?? []);
  const [rotation, setRotation] = useState<ChoreRotation>(initial?.rotation ?? 'fixed');
  const [showConfirm, setShowConfirm] = useState(false);

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canSave = name.trim().length > 0 && assigneeIds.length > 0;
  const validationHint = !name.trim()
    ? 'Enter a chore name'
    : assigneeIds.length === 0
      ? 'Select at least one person'
      : null;
  const isEdit = !!initial;

  const handleSubmit = () => {
    if (!canSave) return;
    onSubmit({
      name: name.trim(),
      emoji,
      points: parseInt(points) || 1,
      frequency,
      daysOfWeek,
      timeOfDay,
      assigneeIds,
      rotation: assigneeIds.length <= 1 ? 'fixed' : rotation,
    });
  };

  return (
    <>
      <FormOverlay title={isEdit ? 'Edit Chore' : 'New Chore'} onBack={onBack}>
        {/* Name */}
        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>Name</div>
          <input
            type="text"
            placeholder="Chore name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            style={INPUT_STYLE}
            autoFocus
          />
        </div>

        {/* Icon */}
        <MobileIconPicker
          value={emoji}
          onChange={setEmoji}
          icons={CHORE_ICONS}
          label="Icon"
        />

        {/* Points & Frequency */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <div>
            <div style={LABEL_STYLE}>Points</div>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              inputMode="numeric"
              min={1}
              style={{ ...INPUT_STYLE, textAlign: 'center' }}
            />
          </div>
          <div>
            <div style={LABEL_STYLE}>Frequency</div>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as ChoreResetFrequency)}
              style={SELECT_STYLE}
            >
              {CHORE_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Time of Day */}
        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>Time of Day</div>
          <select
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value as ChoreTimeOfDay)}
            style={SELECT_STYLE}
          >
            {(['morning', 'afternoon', 'evening', 'anytime'] as const).map((t) => (
              <option key={t} value={t}>
                {TIME_OF_DAY_META[t].label}
              </option>
            ))}
          </select>
        </div>

        {/* Days of week */}
        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>Days</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => {
              const isOn = daysOfWeek.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  className="press-scale-xs"
                  onClick={() => toggleDay(d)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    flexShrink: 0,
                    border: `1px solid ${isOn ? 'rgba(255,255,255,0.2)' : '#2a2a2a'}`,
                    background: isOn ? 'rgba(255,255,255,0.12)' : '#1a1a1a',
                    color: isOn ? '#e5e5e5' : '#525252',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {DAY_NAMES_SHORT[d][0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Assignees */}
        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>Assign to</div>
          <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #1a1a1a' }}>
            {members.map((m, i) => {
              const isAssigned = assigneeIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleAssignee(m.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    minHeight: 48,
                    background: '#141414',
                    border: 'none',
                    borderBottom: i < members.length - 1 ? '1px solid #1a1a1a' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    color: 'inherit',
                    textAlign: 'left' as const,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      border: isAssigned ? 'none' : '2px solid #333',
                      background: isAssigned ? m.color : 'transparent',
                    }}
                  >
                    {isAssigned && <Check size={14} color="white" strokeWidth={3} />}
                  </div>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: `color-mix(in srgb, ${m.color} 15%, transparent)`,
                    }}
                  >
                    {m.emoji ? (
                      <ChoreIcon value={m.emoji} size={18} color={m.color} />
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 600, color: m.color }}>{m.name[0]}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 500, color: '#e5e5e5', flex: 1 }}>
                    {m.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rotation */}
        {assigneeIds.length >= 2 && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>Rotation</div>
            <select
              value={rotation}
              onChange={(e) => setRotation(e.target.value as ChoreRotation)}
              style={SELECT_STYLE}
            >
              {CHORE_ROTATIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Validation hint */}
        {validationHint && (
          <p style={{ fontSize: 13, color: '#fbbf24', textAlign: 'center', margin: '0 0 8px' }}>
            {validationHint}
          </p>
        )}

        {/* Save */}
        <button
          className="press-btn"
          onClick={handleSubmit}
          disabled={!canSave}
          style={{
            width: '100%',
            minHeight: 48,
            padding: 14,
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
            border: 'none',
            cursor: canSave ? 'pointer' : 'default',
            background: canSave ? '#f59e0b' : '#525252',
            opacity: canSave ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          {isEdit ? 'Save Chore' : 'Add Chore'}
        </button>

        {/* Delete */}
        {isEdit && onDelete && (
          <button
            className="press-scale"
            onClick={() => setShowConfirm(true)}
            style={{
              width: '100%',
              minHeight: 48,
              padding: 14,
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              background: 'rgba(239,68,68,0.12)',
              color: '#ef4444',
              border: 'none',
              cursor: 'pointer',
              marginTop: 12,
              transition: 'all 0.15s',
            }}
          >
            Delete Chore
          </button>
        )}
      </FormOverlay>

      {showConfirm && onDelete && (
        <ConfirmSheet
          title={`Delete "${name}"?`}
          description="This chore and all its completion history will be removed."
          confirmLabel="Delete Chore"
          onConfirm={() => { onDelete(); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ── Main Exported Component ───────────────────────────────────────

interface ChoresManageViewProps {
  members: ChoreMember[];
  chores: ChoreDefinition[];
  onMembersChange: (members: ChoreMember[]) => void;
  onChoresChange: (chores: ChoreDefinition[]) => void;
}

export default function ChoresManageView({
  members,
  chores,
  onMembersChange,
  onChoresChange,
}: ChoresManageViewProps) {
  const [section, setSection] = useState<'members' | 'chores'>('chores');
  const [overlay, setOverlay] = useState<
    | { type: 'member-form'; member?: ChoreMember }
    | { type: 'chore-form'; chore?: ChoreDefinition }
    | null
  >(null);

  // ── CRUD helpers ──

  const addMember = (data: Omit<ChoreMember, 'id'>) => {
    onMembersChange([...members, { ...data, id: uuid() }]);
    setOverlay(null);
  };

  const updateMember = (id: string, data: Omit<ChoreMember, 'id'>) => {
    onMembersChange(members.map((m) => (m.id === id ? { ...data, id } : m)));
    setOverlay(null);
  };

  const deleteMember = (id: string) => {
    const result = cascadeDeleteMember(members, chores, id);
    onMembersChange(result.members);
    onChoresChange(result.chores);
    setOverlay(null);
  };

  const addChore = (data: Omit<ChoreDefinition, 'id'>) => {
    onChoresChange([...chores, { ...data, id: uuid() }]);
    setOverlay(null);
  };

  const updateChore = (id: string, data: Omit<ChoreDefinition, 'id'>) => {
    onChoresChange(chores.map((c) => (c.id === id ? { ...data, id } : c)));
    setOverlay(null);
  };

  const deleteChore = (id: string) => {
    onChoresChange(chores.filter((c) => c.id !== id));
    setOverlay(null);
  };

  // Count chores per member
  const memberChoreCount = (memberId: string) =>
    chores.filter((c) => c.assigneeIds.includes(memberId)).length;

  return (
    <div>
      {/* Inner tabs: Members / Chores */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        {(['chores', 'members'] as const).map((tab) => {
          const isActive = section === tab;
          const count = tab === 'members' ? members.length : chores.length;
          return (
            <button
              key={tab}
              onClick={() => setSection(tab)}
              style={{
                flex: 1,
                padding: '8px 12px',
                minHeight: 40,
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: isActive ? '#e5e5e5' : '#525252',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {tab === 'chores' ? 'Chores' : 'Members'}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Member List */}
      {section === 'members' && (
        <div>
          {members.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <p style={{ fontSize: 14, color: '#525252', marginBottom: 4 }}>No members yet</p>
              <p style={{ fontSize: 12, color: '#404040' }}>Add family members to get started</p>
            </div>
          )}

          {members.map((member) => (
            <button
              key={member.id}
              className="press-scale"
              aria-label={`Edit ${member.name}`}
              onClick={() => setOverlay({ type: 'member-form', member })}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 14,
                marginBottom: 8,
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'left' as const,
                color: 'inherit',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: `color-mix(in srgb, ${member.color} 15%, transparent)`,
                }}
              >
                {member.emoji ? (
                  <ChoreIcon value={member.emoji} size={20} color={member.color} />
                ) : (
                  <span style={{ fontSize: 16, fontWeight: 600, color: member.color }}>{member.name[0]}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5' }}>{member.name}</div>
                <div style={{ fontSize: 12, color: '#525252', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: member.color,
                      flexShrink: 0,
                    }}
                  />
                  {memberChoreCount(member.id)} chore{memberChoreCount(member.id) !== 1 ? 's' : ''} assigned
                </div>
              </div>
              <ChevronRight size={20} color="#404040" style={{ flexShrink: 0 }} />
            </button>
          ))}

          <button
            className="press-scale"
            onClick={() => setOverlay({ type: 'member-form' })}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              minHeight: 48,
              borderRadius: 14,
              border: '2px dashed #2a2a2a',
              color: '#525252',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              marginTop: 4,
              background: 'none',
            }}
          >
            <Plus size={18} />
            Add Member
          </button>
        </div>
      )}

      {/* Chore List */}
      {section === 'chores' && (
        <div>
          {chores.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <p style={{ fontSize: 14, color: '#525252', marginBottom: 4 }}>No chores yet</p>
              {members.length === 0 ? (
                <p style={{ fontSize: 12, color: '#404040' }}>Add family members first</p>
              ) : (
                <p style={{ fontSize: 12, color: '#404040' }}>Add chores and assign them to members</p>
              )}
            </div>
          )}

          {chores.map((chore) => (
            <button
              key={chore.id}
              className="press-scale"
              aria-label={`Edit ${chore.name}`}
              onClick={() => setOverlay({ type: 'chore-form', chore })}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 14,
                marginBottom: 8,
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'left' as const,
                color: 'inherit',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)',
                }}
              >
                {chore.emoji ? (
                  <ChoreIcon value={chore.emoji} size={20} color="#a3a3a3" />
                ) : (
                  <span style={{ fontSize: 14, color: '#525252' }}>?</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5' }}>{chore.name}</div>
                <div style={{ fontSize: 12, color: '#525252', marginTop: 2 }}>
                  {chore.frequency === 'daily' ? 'Daily' : chore.frequency === 'biweekly' ? 'Every Other Week' : 'Weekly'}
                  {' \u00b7 '}{TIME_OF_DAY_META[chore.timeOfDay].label}
                  {' \u00b7 '}{chore.points}pt{chore.points !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 11, color: '#404040', marginTop: 2 }}>
                  &rarr;{' '}
                  {chore.assigneeIds
                    .map((id) => members.find((m) => m.id === id)?.name ?? '?')
                    .join(', ')}
                  {chore.rotation !== 'fixed' && chore.assigneeIds.length > 1 && (
                    <span> ({chore.rotation === 'rotate-daily' ? 'rotate daily' : 'rotate weekly'})</span>
                  )}
                </div>
              </div>
              <ChevronRight size={20} color="#404040" style={{ flexShrink: 0 }} />
            </button>
          ))}

          <button
            className="press-scale"
            onClick={() => {
              if (members.length === 0) return;
              setOverlay({ type: 'chore-form' });
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              minHeight: 48,
              borderRadius: 14,
              border: '2px dashed #2a2a2a',
              color: members.length === 0 ? '#333' : '#525252',
              fontSize: 14,
              fontWeight: 600,
              cursor: members.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              marginTop: 4,
              background: 'none',
            }}
          >
            <Plus size={18} />
            Add Chore
          </button>
        </div>
      )}

      {/* ── Overlays ── */}

      {overlay?.type === 'member-form' && (
        <MemberFormOverlay
          key={overlay.member?.id ?? 'new'}
          initial={overlay.member}
          choreCount={overlay.member ? memberChoreCount(overlay.member.id) : undefined}
          onSubmit={(data) =>
            overlay.member
              ? updateMember(overlay.member.id, data)
              : addMember(data)
          }
          onDelete={
            overlay.member
              ? () => deleteMember(overlay.member!.id)
              : undefined
          }
          onBack={() => setOverlay(null)}
        />
      )}

      {overlay?.type === 'chore-form' && (
        <ChoreFormOverlay
          key={overlay.chore?.id ?? 'new'}
          initial={overlay.chore}
          members={members}
          onSubmit={(data) =>
            overlay.chore
              ? updateChore(overlay.chore.id, data)
              : addChore(data)
          }
          onDelete={
            overlay.chore
              ? () => deleteChore(overlay.chore!.id)
              : undefined
          }
          onBack={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
