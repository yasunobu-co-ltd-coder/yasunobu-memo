'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Deal, Tri, AssignmentType, getDeals, updateDeal, deleteDeal } from '../lib/deals';
import { User, getUsers, addUser, deleteUser, updateUserOrder } from '../lib/users';
import { getLastChecked, updateLastChecked } from '../lib/unread';
import { PushNotificationUI } from './components/PushNotificationUI';
import UpdateNotice from './components/UpdateNotice';
import { PullToRefresh } from './components/PullToRefresh';
import { supabase } from '../lib/supabase';
import { markAsRead, getReadsForMemos } from '../lib/reads';

const APP_VERSION = 'v1.0.0';
const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA || 'dev';

const TRI_SCORE: Record<Tri, number> = { 高: 3, 中: 2, 低: 1 };

// PIN認証コード（環境変数から取得）
const VALID_PIN = process.env.NEXT_PUBLIC_APP_PIN || '';

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(ymd: string) {
  if (!ymd) return '—';
  const [, m, d] = ymd.split('-');
  return `${m}/${d}`;
}

// Legacy 'open' → '未着手' mapping
function normalizeStatus(status: string): '未着手' | '対応中' | 'done' {
  if (status === 'done') return 'done';
  if (status === '対応中') return '対応中';
  return '未着手'; // 'open' or '未着手' or anything else
}

function statusLabel(status: string): string {
  const s = normalizeStatus(status);
  if (s === 'done') return '完了';
  if (s === '対応中') return '対応中';
  return '未着手';
}

function statusColor(status: string): string {
  const s = normalizeStatus(status);
  if (s === 'done') return '#10b981';
  if (s === '対応中') return '#f59e0b';
  return '#94a3b8';
}

export default function Page() {
  // Auth State
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Config
  const [me, setMe] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [deleteMode, setDeleteMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newUserName, setNewUserName] = useState('');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteRefs, setDeleteRefs] = useState<{ counts: Record<string, number>; canDelete: boolean } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Drag & Drop
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartYRef = useRef(0);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  // Data
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'new' | 'done'>('list');

  // Filters
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'全件' | '自分担当' | '任せる' | '自分で' | '期限切れ'>('自分担当');
  const [sortBy, setSortBy] = useState<'期限が近い順' | '重要度' | '急ぎ度' | '利益度' | '新しい順' | '古い順'>('期限が近い順');

  // Form
  const [clientName, setClientName] = useState('');
  const [memo, setMemo] = useState('');
  const [dueDate, setDueDate] = useState(todayYmd());
  const [importance, setImportance] = useState<Tri>('中');
  const [profit, setProfit] = useState<Tri>('中');
  const [urgency, setUrgency] = useState<Tri>('中');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('自分で');
  const [assignee, setAssignee] = useState<string>('');

  // Edit mode
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editImportance, setEditImportance] = useState<Tri>('中');
  const [editProfit, setEditProfit] = useState<Tri>('中');
  const [editUrgency, setEditUrgency] = useState<Tri>('中');
  const [editAssignmentType, setEditAssignmentType] = useState<AssignmentType>('自分で');
  const [editAssignee, setEditAssignee] = useState<string>('');

  // Dashboard
  const [showDashboard, setShowDashboard] = useState(false);

  // Help
  const [showHelp, setShowHelp] = useState(false);

  // Reads (既読)
  const [memoReads, setMemoReads] = useState<Record<string, { user_id: string; user_name: string }[]>>({});

  // Notifications
  const [showNotif, setShowNotif] = useState(false);
  const [lastCheckedNotif, setLastCheckedNotif] = useState<string | null>(null);

  // Calendar
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calFilter, setCalFilter] = useState<'全件' | '自分担当'>('自分担当');

  // 自分のUUID（フィルタ比較用）
  const meId = useMemo(() => users.find(u => u.name === me)?.id || '', [users, me]);

  // Voice Input
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Check PIN from sessionStorage on mount + Supabase接続プリウォーム
  useEffect(() => {
    // PIN画面表示中にSupabase TLS接続を確立（コールドスタート~1s を先に消化）
    supabase.from('users').select('id').limit(1).then(() => {
      console.log('[perf] supabase connection warmed');
    });

    const verified = sessionStorage.getItem('yasunobu_pin_verified');
    if (verified === 'true') {
      setIsPinVerified(true);
    }
    const savedMe = localStorage.getItem('yasunobu_me');
    if (savedMe) {
      setMe(savedMe);
    }
  }, []);

  // Load users from Supabase
  const loadUsers = useCallback(async () => {
    const data = await getUsers();
    setUsers(data);
  }, []);

  // Load deals from Supabase
  const loadDeals = useCallback(async () => {
    setLoading(true);
    const data = await getDeals();
    setDeals(data);
    setLoading(false);
  }, []);

  // PIN認証後にusers + dealsを並列取得（最大ボトルネック解消）
  useEffect(() => {
    if (!isPinVerified) return;
    const t0 = performance.now();
    Promise.all([loadUsers(), loadDeals()]).then(() => {
      console.log(`[perf] initial load: ${(performance.now() - t0).toFixed(0)}ms`);
    });
  }, [isPinVerified, loadUsers, loadDeals]);

  // Load reads when deals change
  useEffect(() => {
    if (deals.length === 0) return;
    const ids = deals.map(d => d.id);
    getReadsForMemos(ids).then(setMemoReads);
  }, [deals]);

  // Mark deals as read when user views the list
  const markedReadRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!meId || deals.length === 0 || tab !== 'list') return;
    const unread = deals.filter(d => normalizeStatus(d.status) !== 'done' && !markedReadRef.current.has(d.id) && !(memoReads[d.id]?.some(r => r.user_id === meId)));
    if (unread.length > 0) {
      unread.forEach(d => markedReadRef.current.add(d.id));
      Promise.all(unread.map(d => markAsRead(d.id, meId))).then(() => {
        getReadsForMemos(deals.map(d => d.id)).then(setMemoReads);
      });
    }
  }, [meId, deals, tab, memoReads]);

  // Pull to Refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([loadUsers(), loadDeals()]);
  }, [loadUsers, loadDeals]);

  // PIN verification handler
  const handlePinSubmit = () => {
    if (pin === VALID_PIN) {
      setIsPinVerified(true);
      sessionStorage.setItem('yasunobu_pin_verified', 'true');
      // 担当者選択画面を必ず表示するため、前回の選択をクリア
      localStorage.removeItem('yasunobu_me');
      setMe('');
      setPinError('');
    } else {
      setPinError('PINコードが正しくありません');
    }
  };

  // Login handler
  const handleLogin = (name: string) => {
    setMe(name);
    localStorage.setItem('yasunobu_me', name);
    const otherUser = users.find(u => u.name !== name);
    setAssignee(otherUser?.id || '');
  };

  const logout = () => {
    setMe('');
    localStorage.removeItem('yasunobu_me');
  };

  // Add user to Supabase
  const handleAddUser = async () => {
    const trimmed = newUserName.trim();
    if (!trimmed) return;
    if (users.some(u => u.name === trimmed)) {
      alert('このユーザーは既に存在します');
      return;
    }
    const created = await addUser(trimmed, users.length);
    if (created) {
      setUsers([...users, created]);
      setNewUserName('');
    } else {
      alert('ユーザーの追加に失敗しました');
    }
  };

  // Remove user from Supabase with reference check
  const removeUser = async (user: User) => {
    if (users.length <= 1) {
      alert('最低1人のユーザーが必要です');
      return;
    }
    // モーダルを開いて参照件数を取得
    setDeleteTarget(user);
    setDeleteRefs(null);
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/refs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDeleteRefs({ counts: data.counts, canDelete: data.canDelete });
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : '参照件数の取得に失敗しました');
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const ok = await deleteUser(deleteTarget.id);
    if (ok) {
      setUsers(users.filter(u => u.id !== deleteTarget.id));
    } else {
      alert('ユーザーの削除に失敗しました');
    }
    setDeleteTarget(null);
    setDeleteRefs(null);
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteRefs(null);
    setDeleteError(null);
  };

  // Handle delete user flow
  const handleDeleteUser = () => {
    if (deleteMode) {
      setDeleteMode(false);
      return;
    }
    if (users.length <= 1) {
      alert('最低1人のユーザーが必要です');
      return;
    }
    setDeleteMode(true);
  };

  // Drag & Drop handlers
  const handleDragStart = (index: number, clientY: number) => {
    if (deleteMode) return;
    dragStartYRef.current = clientY;
    longPressTimerRef.current = setTimeout(() => {
      setDragIndex(index);
      setDragOverIndex(index);
      setIsDragging(true);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 250);
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging || dragIndex === null) {
      // Cancel long press if moved too much before drag starts
      if (longPressTimerRef.current && Math.abs(clientY - dragStartYRef.current) > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }
    // Determine which card we're over
    const cards = document.querySelectorAll('[data-user-index]');
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const idx = parseInt(card.getAttribute('data-user-index') || '0');
        setDragOverIndex(idx);
      }
    });
  };

  const handleDragEnd = async () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isDragging && dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const newUsers = [...users];
      const [moved] = newUsers.splice(dragIndex, 1);
      newUsers.splice(dragOverIndex, 0, moved);
      setUsers(newUsers);
      await Promise.all(newUsers.map((u, i) => updateUserOrder(u.id, i)));
    }
    setDragIndex(null);
    setDragOverIndex(null);
    setIsDragging(false);
  };

  // Submit new deal（サーバーAPI経由 → Push通知自動送信）
  const submit = async () => {
    if (!me || submitting) return;
    const meUser = users.find(u => u.name === me);
    if (!meUser) return;

    setSubmitting(true);

    const newDeal = {
      created_by: meUser.id,
      client_name: clientName.trim(),
      memo: memo.trim(),
      due_date: dueDate,
      importance,
      profit,
      urgency,
      assignment_type: assignmentType,
      assignee: assignmentType === '自分で' ? meUser.id : (assignee || meUser.id),
      status: '未着手',
    };

    try {
      const res = await fetch('/api/yasunobu-memo/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDeal),
      });
      const data = await res.json();
      if (res.ok && data.deal) {
        setDeals([data.deal, ...deals]);
      } else {
        console.error('Memo create failed:', data.error);
      }
    } catch (e) {
      console.error('Memo create exception:', e);
    }

    // Reset & Nav
    setClientName('');
    setMemo('');
    setDueDate(todayYmd());
    setImportance('中');
    setTab('list');

    // 5秒間連打防止
    setTimeout(() => setSubmitting(false), 5000);
  };

  // Mark as done
  const markDone = async (id: string) => {
    const updated = await updateDeal(id, { status: 'done' });
    if (updated) {
      setDeals(deals.map(d => d.id === id ? updated : d));
    }
  };

  // Restore
  const restore = async (id: string) => {
    const updated = await updateDeal(id, { status: '未着手' });
    if (updated) {
      setDeals(deals.map(d => d.id === id ? updated : d));
    }
  };

  // Delete deal permanently
  const handleDelete = async (id: string) => {
    if (!confirm('このメモをデータベースから完全に削除します。\nこの操作は取り消せません。\n\n本当に削除しますか？')) return;
    const success = await deleteDeal(id);
    if (success) {
      setDeals(deals.filter(d => d.id !== id));
    }
  };

  // Start editing
  const startEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setEditClientName(deal.client_name);
    setEditMemo(deal.memo);
    setEditDueDate(deal.due_date);
    setEditImportance(deal.importance);
    setEditProfit(deal.profit);
    setEditUrgency(deal.urgency);
    setEditAssignmentType(deal.assignment_type);
    setEditAssignee(deal.assignee);
  };

  // Save edit
  const saveEdit = async () => {
    if (!editingDeal) return;
    const meUser = users.find(u => u.name === me);
    const updated = await updateDeal(editingDeal.id, {
      client_name: editClientName,
      memo: editMemo,
      due_date: editDueDate,
      importance: editImportance,
      profit: editProfit,
      urgency: editUrgency,
      assignment_type: editAssignmentType,
      assignee: editAssignmentType === '自分で' ? (meUser?.id || editingDeal.assignee) : (editAssignee || editingDeal.assignee),
    });
    if (updated) {
      setDeals(deals.map(d => d.id === editingDeal.id ? updated : d));
    }
    setEditingDeal(null);
  };

  // Voice Recording Handler
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await sendAudioToApi(blob);
        stream.getTracks().forEach(track => track.stop()); // Stop mic
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic error:', err);
      alert('マイクへのアクセスが許可されていません');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioToApi = async (blob: Blob) => {
    setIsProcessingVoice(true);
    try {
      const formData = new FormData();
      formData.append('file', blob);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('API Error');

      const data = await res.json();
      const { result } = data;

      if (result) {
        if (result.clientName) setClientName(result.clientName);
        if (result.memo) setMemo(result.memo);
        if (result.dueDate) setDueDate(result.dueDate);
        if (result.importance) setImportance(result.importance);
        if (result.urgency) setUrgency(result.urgency);
        if (result.profit) setProfit(result.profit);

        if (result.assignmentType) {
          setAssignmentType(result.assignmentType);
          if (result.assignmentType === '任せる' && result.assignee) {
            // ユーザーリストに近い名前があれば選択する簡易ロジック
            const found = users.find(u => u.name.includes(result.assignee) || result.assignee.includes(u.name));
            if (found) setAssignee(found.name);
          }
        }
      }

    } catch (e) {
      console.error(e);
      alert('音声解析に失敗しました');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingDeal(null);
  };

  // Load last_checked_at from DB when user logs in
  useEffect(() => {
    if (!meId) return;
    getLastChecked(meId).then(val => setLastCheckedNotif(val));
  }, [meId]);

  // Notifications: deals assigned to me by others
  const notifications = useMemo(() => {
    return deals.filter(d => d.assignee === meId && d.created_by !== meId);
  }, [deals, meId]);

  const unreadCount = useMemo(() => {
    if (!lastCheckedNotif) return notifications.length;
    return notifications.filter(d => d.created_at > lastCheckedNotif).length;
  }, [notifications, lastCheckedNotif]);

  const openNotif = async () => {
    setShowNotif(true);
    await updateLastChecked(meId);
    setLastCheckedNotif(new Date().toISOString());
  };

  // Filter Logic
  const filtered = useMemo(() => {
    const now = todayYmd();
    let list = deals.filter(d => tab === 'done' ? normalizeStatus(d.status) === 'done' : normalizeStatus(d.status) !== 'done');

    if (query) {
      list = list.filter(d => (d.client_name || '').includes(query) || (d.memo || '').includes(query));
    }

    if (filter === '自分担当' && meId) list = list.filter(d => d.assignee === meId);
    if (filter === '任せる') list = list.filter(d => d.assignment_type === '任せる');
    if (filter === '自分で') list = list.filter(d => d.assignment_type === '自分で');
    if (filter === '期限切れ') list = list.filter(d => d.due_date < now);

    const sorters: Record<typeof sortBy, (a: Deal, b: Deal) => number> = {
      '期限が近い順': (a, b) => a.due_date.localeCompare(b.due_date),
      重要度: (a, b) => TRI_SCORE[b.importance] - TRI_SCORE[a.importance],
      急ぎ度: (a, b) => TRI_SCORE[b.urgency] - TRI_SCORE[a.urgency],
      '利益度': (a, b) => TRI_SCORE[b.profit] - TRI_SCORE[a.profit],
      新しい順: (a, b) => b.created_at.localeCompare(a.created_at),
      古い順: (a, b) => a.created_at.localeCompare(b.created_at),
    };
    return [...list].sort(sorters[sortBy]);
  }, [deals, tab, query, filter, sortBy, me]);

  // === PIN Screen ===
  if (!isPinVerified) {
    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>{APP_VERSION} ({COMMIT_SHA})</div>
        <div className="login-card">
          <h1 className="brand" style={{ textAlign: 'center', fontSize: '24px', marginBottom: '8px' }}>yasunobu-memo</h1>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '32px' }}>PINコードを入力してください</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              className="input-field"
              style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', width: '150px' }}
              placeholder="____"
              autoComplete="off"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => { if (e.key === 'Enter') handlePinSubmit(); }}
            />
            {pinError && <p style={{ color: '#ef4444', fontSize: '14px' }}>{pinError}</p>}
            <button
              className="primary-btn"
              style={{ width: '150px' }}
              onClick={handlePinSubmit}
              disabled={pin.length !== 4}
            >
              確認
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === Login View ===
  if (!me) {
    return (
      <div className="login-screen" style={{ position: 'relative' }}>
        <button
          onClick={() => setShowDashboard(true)}
          style={{ display: 'block', margin: '0 auto 12px', background: '#2563eb', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '12px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
        >
          ダッシュボード
        </button>
        <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>{APP_VERSION} ({COMMIT_SHA})</div>
        <div className="login-card">
          <h1 className="brand" style={{ textAlign: 'center', fontSize: '24px', marginBottom: '8px' }}>yasunobu-memo</h1>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: isDragging ? '16px' : '32px' }}>
            {isDragging ? 'ドラッグして並び替え' : '担当者を選択して開始'}
          </p>

          <UpdateNotice />

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}
            onTouchMove={e => handleDragMove(e.touches[0].clientY)}
            onTouchEnd={handleDragEnd}
            onMouseMove={e => handleDragMove(e.clientY)}
            onMouseUp={handleDragEnd}
          >
            {users.map((u, i) => (
              <div
                key={u.id}
                data-user-index={i}
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  opacity: dragIndex === i ? 0.5 : 1,
                  transform: dragOverIndex !== null && dragIndex !== null && dragIndex !== i
                    ? (i > dragIndex && i <= dragOverIndex ? 'translateY(-8px)'
                      : i < dragIndex && i >= dragOverIndex ? 'translateY(8px)' : 'none')
                    : 'none',
                  transition: isDragging ? 'transform 0.15s ease' : 'none',
                }}
              >
                {/* Grip Icon */}
                {!deleteMode && (
                  <span
                    style={{ fontSize: '20px', color: '#94a3b8', cursor: 'grab', userSelect: 'none', touchAction: 'none', padding: '8px 2px' }}
                    onTouchStart={e => { e.stopPropagation(); handleDragStart(i, e.touches[0].clientY); }}
                    onMouseDown={e => { e.stopPropagation(); handleDragStart(i, e.clientY); }}
                  >
                    ⠿
                  </span>
                )}
                <button
                  className="glass-panel"
                  style={{
                    flex: 1, padding: '16px', borderRadius: '12px',
                    border: deleteMode ? '2px solid #ef4444' : (dragOverIndex === i && isDragging ? '2px solid #3b82f6' : 'none'),
                    cursor: isDragging ? 'grabbing' : 'pointer', fontWeight: 'bold', color: '#334155', textAlign: 'center'
                  }}
                  onClick={() => { if (!isDragging) { deleteMode ? removeUser(u) : handleLogin(u.name); } }}
                >
                  {u.name}
                </button>
                {deleteMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeUser(u); }}
                    style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '28px', height: '28px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!deleteMode && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  name="newUser"
                  className="input-field"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="新しいユーザー名"
                  style={{ flex: 1, margin: 0 }}
                  onKeyDown={e => e.key === 'Enter' && handleAddUser()}
                />
                <button
                  onClick={handleAddUser}
                  style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  追加
                </button>
              </div>
            )}
            <button
              onClick={handleDeleteUser}
              style={{ width: '100%', background: deleteMode ? '#64748b' : '#ef4444', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}
            >
              {deleteMode ? 'キャンセル' : 'ユーザーを削除'}
            </button>
          </div>
        </div>

        {/* ダッシュボードモーダル */}
        {showDashboard && (() => {
          const openDeals = deals.filter(d => normalizeStatus(d.status) !== 'done');
          const doneDeals = deals.filter(d => normalizeStatus(d.status) === 'done');
          const overdueDeals = openDeals.filter(d => d.due_date < todayYmd());
          const perUser: Record<string, { name: string; total: number; miChakushu: number; taiouChuu: number; done: number; overdue: number }> = {};
          users.forEach(u => { perUser[u.id] = { name: u.name, total: 0, miChakushu: 0, taiouChuu: 0, done: 0, overdue: 0 }; });
          deals.forEach(d => {
            if (!perUser[d.assignee]) return;
            perUser[d.assignee].total++;
            const s = normalizeStatus(d.status);
            if (s === '未着手') perUser[d.assignee].miChakushu++;
            else if (s === '対応中') perUser[d.assignee].taiouChuu++;
            else perUser[d.assignee].done++;
            if (s !== 'done' && d.due_date < todayYmd()) perUser[d.assignee].overdue++;
          });
          return (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px' }}>
              <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '440px', maxHeight: '85vh', overflowY: 'auto', marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '700' }}>ダッシュボード</h2>
                  <button onClick={() => setShowDashboard(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>×</button>
                </div>

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ background: '#eff6ff', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#2563eb' }}>{openDeals.length}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>未完了</div>
                  </div>
                  <div style={{ background: '#fef3c7', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#d97706' }}>{overdueDeals.length}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>期限切れ</div>
                  </div>
                  <div style={{ background: '#ecfdf5', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#10b981' }}>{doneDeals.length}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>完了</div>
                  </div>
                </div>

                {/* Per-user stats */}
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#475569', marginBottom: '10px' }}>担当者別</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {users.map(u => {
                    const s = perUser[u.id];
                    if (!s) return null;
                    return (
                      <div key={u.id} style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '6px', color: '#1e293b' }}>{s.name}</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
                          <span style={{ color: '#94a3b8' }}>未着手: <b>{s.miChakushu}</b></span>
                          <span style={{ color: '#d97706' }}>対応中: <b>{s.taiouChuu}</b></span>
                          <span style={{ color: '#10b981' }}>完了: <b>{s.done}</b></span>
                          {s.overdue > 0 && <span style={{ color: '#ef4444' }}>期限切れ: <b>{s.overdue}</b></span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 削除確認モーダル */}
        {deleteTarget && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '16px',
          }} onClick={closeDeleteModal}>
            <div
              className="glass-panel"
              style={{ maxWidth: '400px', width: '100%', padding: '24px', borderRadius: '16px' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>
                「{deleteTarget.name}」の参照状況
              </h3>

              {deleteLoading && (
                <p style={{ color: '#64748b', textAlign: 'center' }}>読み込み中...</p>
              )}

              {deleteError && (
                <p style={{ color: '#ef4444' }}>エラー: {deleteError}</p>
              )}

              {deleteRefs && (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '14px' }}>
                    <tbody>
                      {[
                        ['案件（ポケット）', deleteRefs.counts.pocket_yasunobu],
                        ['メモ（作成）', deleteRefs.counts.memo_created],
                        ['メモ（担当）', deleteRefs.counts.memo_assigned],
                        ['未読', deleteRefs.counts.memo_unread],
                        ['通知購読', deleteRefs.counts.push_subs],
                        ['通知ログ', deleteRefs.counts.notif_triggered],
                      ].map(([label, count]) => (
                        <tr key={label as string} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px 4px', color: '#475569' }}>{label}</td>
                          <td style={{
                            padding: '8px 4px', textAlign: 'right', fontWeight: 'bold',
                            color: (count as number) > 0 ? '#ef4444' : '#22c55e',
                          }}>
                            {count}件
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {deleteRefs.canDelete ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={closeDeleteModal}
                        style={{ flex: 1, padding: '12px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={confirmDeleteUser}
                        style={{ flex: 1, padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        削除する
                      </button>
                    </div>
                  ) : (
                    <>
                      <p style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px', margin: '0 0 12px' }}>
                        関連データが残っているため削除できません
                      </p>
                      <button
                        onClick={closeDeleteModal}
                        style={{ width: '100%', padding: '12px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        閉じる
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // === Loading ===
  if (loading) {
    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', color: '#64748b' }}>読み込み中...</div>
      </div>
    );
  }

  // === Main App View ===
  return (
    <div className="wrap">
      {/* Header */}
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="brand">yasunobu-memo <span style={{ fontSize: '10px', opacity: 0.7 }}>v1.1</span></div>
          <button onClick={openNotif} className="notif-bell">
            🔔
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>
          <button onClick={() => { setShowCalendar(true); setSelectedDate(null); }} className="notif-bell">
            📅
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={() => setShowHelp(true)} style={{ background: 'none', border: '1.5px solid #94a3b8', borderRadius: '50%', width: '28px', height: '28px', fontSize: '14px', fontWeight: '700', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>?</button>
          <span className="user-badge">{me}</span>
          <button onClick={logout} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '4px 8px', fontSize: '11px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>切替</button>
        </div>
      </header>

      {/* Push通知設定 */}
      <div style={{ padding: '0 16px' }}>
        <PushNotificationUI userId={users.find(u => u.name === me)?.id || ''} />
      </div>

      {/* Content Area */}
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="content">

        {/* NEW CASE FORM */}
        {tab === 'new' && (
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>新規案件登録</h2>

            {/* Voice Input Button */}
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessingVoice}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '99px',
                  background: isRecording ? '#ef4444' : (isProcessingVoice ? '#94a3b8' : '#3b82f6'),
                  color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '20px' }}>{isRecording ? '⏹️' : '🎙️'}</span>
                {isProcessingVoice ? '解析中...' : (isRecording ? '録音停止 & 解析' : '音声で入力する')}
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="clientName" className="input-label">誰からの案件？ (会社名/担当者)</label>
              <input
                id="clientName"
                name="clientName"
                className="input-field"
                placeholder="例: A社 山田さん"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="memo" className="input-label">内容 (メモ)</label>
              <textarea
                id="memo"
                className="input-field"
                rows={4}
                placeholder="要件を入力..."
                value={memo}
                onChange={e => setMemo(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="dueDate" className="input-label">期限</label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="input-field"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div>
                <label htmlFor="importance" className="input-label">重要度</label>
                <select id="importance" name="importance" className="input-field" value={importance} onChange={e => setImportance(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
              <div>
                <label htmlFor="urgency" className="input-label">急ぎ</label>
                <select id="urgency" name="urgency" className="input-field" value={urgency} onChange={e => setUrgency(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
              <div>
                <label htmlFor="profit" className="input-label">利益度</label>
                <select id="profit" name="profit" className="input-field" value={profit} onChange={e => setProfit(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="input-label">担当</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  className={`glass-panel`}
                  style={{
                    padding: '8px 16px', borderRadius: '99px', cursor: 'pointer',
                    background: assignmentType === '自分で' ? '#e0f2fe' : 'transparent',
                    color: assignmentType === '自分で' ? '#0284c7' : '#64748b',
                    borderColor: assignmentType === '自分で' ? '#0284c7' : '#e2e8f0'
                  }}
                  onClick={() => setAssignmentType('自分で')}
                >
                  自分でやる
                </button>
                <button
                  type="button"
                  className={`glass-panel`}
                  style={{
                    padding: '8px 16px', borderRadius: '99px', cursor: 'pointer',
                    background: assignmentType === '任せる' ? '#e0f2fe' : 'transparent',
                    color: assignmentType === '任せる' ? '#0284c7' : '#64748b',
                    borderColor: assignmentType === '任せる' ? '#0284c7' : '#e2e8f0'
                  }}
                  onClick={() => setAssignmentType('任せる')}
                >
                  誰かに任せる
                </button>
              </div>

              {assignmentType === '任せる' && (
                <select id="assignee" name="assignee" className="input-field" value={assignee} onChange={e => setAssignee(e.target.value)}>
                  {users.filter(u => u.name !== me).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
            </div>

            <button className="primary-btn" onClick={submit} disabled={!memo.trim() || submitting}>
              {submitting ? '読み込み中...' : '登録する'}
            </button>
            <div style={{ height: '40px' }} />
          </div>
        )}

        {/* LIST VIEW */}
        {tab !== 'new' && (
          <>
            {/* Search Bar */}
            <div style={{ marginBottom: '12px' }}>
              <input
                name="search"
                type="text"
                className="input-field"
                placeholder="🔍 検索（会社名・内容）"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ padding: '10px 14px', fontSize: '14px' }}
              />
            </div>

            {/* Filters (Horizontal Scroll) */}
            <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: '12px', marginBottom: '8px', display: 'flex', gap: '8px' }}>
              {(tab === 'done' ? ['全件', '自分担当'] : ['全件', '自分担当', '期限切れ']).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f as typeof filter)}
                  style={{
                    background: filter === f ? (f === '期限切れ' ? '#ef4444' : '#2563eb') : '#fff',
                    color: filter === f ? '#fff' : (f === '期限切れ' ? '#ef4444' : '#64748b'),
                    border: filter === f ? 'none' : (f === '期限切れ' ? '1px solid #ef4444' : '1px solid #e2e8f0'),
                    padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: '600', flexShrink: 0
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor="sortBy" style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>並び替え</label>
              <select
                id="sortBy"
                name="sortBy"
                className="input-field"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                style={{ padding: '10px 14px', fontSize: '14px' }}
              >
                <option value="期限が近い順">期限が近い順</option>
                <option value="重要度">重要度</option>
                <option value="急ぎ度">急ぎ度</option>
                <option value="利益度">利益度</option>
                <option value="新しい順">新しい順</option>
                <option value="古い順">古い順</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                案件はありません
              </div>
            ) : (
              filtered.map(d => (
                <div key={d.id} className="deal-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="due-badge" style={{ color: d.due_date < todayYmd() && normalizeStatus(d.status) !== 'done' ? '#ef4444' : '#64748b' }}>
                      期限: {fmtDate(d.due_date)}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: statusColor(d.status), background: statusColor(d.status) + '18', padding: '2px 10px', borderRadius: '99px' }}>
                      {statusLabel(d.status)}
                    </span>
                  </div>

                  <div className="client-name">{d.client_name || '(相手不明)'}</div>

                  <div className="indicators">
                    <span className={`tag ${d.importance === '高' ? 'tag-hi' : d.importance === '中' ? 'tag-mid' : 'tag-lo'}`}>重要:{d.importance}</span>
                    <span className={`tag ${d.urgency === '高' ? 'tag-hi' : d.urgency === '中' ? 'tag-mid' : 'tag-lo'}`}>急ぎ:{d.urgency}</span>
                    <span className={`tag ${d.profit === '高' ? 'tag-hi' : d.profit === '中' ? 'tag-mid' : 'tag-lo'}`}>利益:{d.profit}</span>
                  </div>

                  <div className="memo-text">{d.memo}</div>

                  {memoReads[d.id] && memoReads[d.id].length > 0 && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                      既読: {memoReads[d.id].map(r => r.user_name).join(', ')}
                    </div>
                  )}

                  <div className="assignee-row">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.assignee === meId ? '#3b82f6' : '#cbd5e1' }} />
                      {d.assignee_user?.name ?? '(不明)'}
                    </span>

                    {normalizeStatus(d.status) !== 'done' ? (
                      <>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => startEdit(d)}
                            style={{ background: '#f1f5f9', color: '#64748b', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            編集
                          </button>
                          {normalizeStatus(d.status) === '未着手' && (
                            <button
                              onClick={async () => { const u = await updateDeal(d.id, { status: '対応中' }); if (u) setDeals(deals.map(x => x.id === d.id ? u : x)); }}
                              style={{ background: '#fef3c7', color: '#d97706', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                              対応中
                            </button>
                          )}
                          {normalizeStatus(d.status) === '対応中' && (
                            <button
                              onClick={async () => { const u = await updateDeal(d.id, { status: '未着手' }); if (u) setDeals(deals.map(x => x.id === d.id ? u : x)); }}
                              style={{ background: '#f1f5f9', color: '#64748b', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                              未着手に戻す
                            </button>
                          )}
                          <button
                            onClick={() => markDone(d.id)}
                            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            完了
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => restore(d.id)}
                          style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          戻す
                        </button>
                        <button
                          onClick={() => handleDelete(d.id)}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editingDeal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>案件編集</h2>

            <div className="form-group">
              <label htmlFor="editClientName" className="input-label">会社名/担当者</label>
              <input id="editClientName" name="editClientName" className="input-field" value={editClientName} onChange={e => setEditClientName(e.target.value)} />
            </div>

            <div className="form-group">
              <label htmlFor="editMemo" className="input-label">内容</label>
              <textarea id="editMemo" className="input-field" rows={3} value={editMemo} onChange={e => setEditMemo(e.target.value)} />
            </div>

            <div className="form-group">
              <label htmlFor="editDueDate" className="input-label">期限</label>
              <input id="editDueDate" name="editDueDate" type="date" className="input-field" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div>
                <label htmlFor="editImportance" className="input-label">重要度</label>
                <select id="editImportance" name="editImportance" className="input-field" value={editImportance} onChange={e => setEditImportance(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
              <div>
                <label htmlFor="editUrgency" className="input-label">急ぎ</label>
                <select id="editUrgency" name="editUrgency" className="input-field" value={editUrgency} onChange={e => setEditUrgency(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
              <div>
                <label htmlFor="editProfit" className="input-label">利益度</label>
                <select id="editProfit" name="editProfit" className="input-field" value={editProfit} onChange={e => setEditProfit(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="input-label">担当</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button type="button" className="glass-panel" style={{ padding: '8px 16px', borderRadius: '99px', cursor: 'pointer', background: editAssignmentType === '自分で' ? '#e0f2fe' : 'transparent', color: editAssignmentType === '自分で' ? '#0284c7' : '#64748b', borderColor: editAssignmentType === '自分で' ? '#0284c7' : '#e2e8f0' }} onClick={() => setEditAssignmentType('自分で')}>自分でやる</button>
                <button type="button" className="glass-panel" style={{ padding: '8px 16px', borderRadius: '99px', cursor: 'pointer', background: editAssignmentType === '任せる' ? '#e0f2fe' : 'transparent', color: editAssignmentType === '任せる' ? '#0284c7' : '#64748b', borderColor: editAssignmentType === '任せる' ? '#0284c7' : '#e2e8f0' }} onClick={() => setEditAssignmentType('任せる')}>誰かに任せる</button>
              </div>
              {editAssignmentType === '任せる' && (
                <select className="input-field" value={editAssignee} onChange={e => setEditAssignee(e.target.value)}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={cancelEdit} style={{ flex: 1, background: '#f1f5f9', color: '#64748b', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={saveEdit} style={{ flex: 1, background: '#2563eb', color: '#fff', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Drawer */}
      {showNotif && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto', marginTop: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>通知</h2>
              <button onClick={() => setShowNotif(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>
            {notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>通知はありません</div>
            ) : (
              notifications.map(d => (
                <div key={d.id} style={{ padding: '14px', background: '#f8fafc', borderRadius: '12px', marginBottom: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', color: '#2563eb', fontWeight: '600', marginBottom: '6px' }}>
                    {d.created_user?.name ?? '(不明)'} さんから依頼
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>{d.client_name || '(相手不明)'}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>{d.memo}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: d.due_date < todayYmd() ? '#ef4444' : '#64748b' }}>期限: {fmtDate(d.due_date)}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: statusColor(d.status), background: statusColor(d.status) + '18', padding: '2px 8px', borderRadius: '99px' }}>{statusLabel(d.status)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Calendar Modal */}
      {showCalendar && (() => {
        const today = todayYmd();
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const firstDow = new Date(calYear, calMonth, 1).getDay();
        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDow; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);

        // Build a map of due_date -> deals (open only, filtered)
        const calDeals = deals.filter(d => normalizeStatus(d.status) !== 'done' && (calFilter === '全件' || d.assignee === meId));
        const dueDateMap: Record<string, Deal[]> = {};
        calDeals.forEach(d => {
          if (!d.due_date) return;
          if (!dueDateMap[d.due_date]) dueDateMap[d.due_date] = [];
          dueDateMap[d.due_date].push(d);
        });

        const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        const dayNames = ['日','月','火','水','木','金','土'];

        const selectedDeals = selectedDate ? (dueDateMap[selectedDate] || []) : [];

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '400px', maxHeight: '85vh', overflowY: 'auto', marginTop: '20px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700' }}>カレンダー</h2>
                <button onClick={() => setShowCalendar(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>×</button>
              </div>

              {/* Calendar Filter */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {(['全件', '自分担当'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => { setCalFilter(f); setSelectedDate(null); }}
                    style={{
                      flex: 1,
                      background: calFilter === f ? '#2563eb' : '#fff',
                      color: calFilter === f ? '#fff' : '#64748b',
                      border: calFilter === f ? '2px solid #2563eb' : '2px solid #e2e8f0',
                      padding: '10px 0', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Month Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <button onClick={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else { setCalMonth(calMonth - 1); } setSelectedDate(null); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: '600' }}>◀</button>
                <span style={{ fontWeight: '700', fontSize: '16px' }}>{calYear}年 {monthNames[calMonth]}</span>
                <button onClick={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } setSelectedDate(null); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: '600' }}>▶</button>
              </div>

              {/* Day Headers */}
              <div className="cal-grid">
                {dayNames.map(dn => (
                  <div key={dn} style={{ textAlign: 'center', fontSize: '11px', fontWeight: '700', color: dn === '日' ? '#ef4444' : dn === '土' ? '#3b82f6' : '#64748b', padding: '4px 0' }}>{dn}</div>
                ))}
              </div>

              {/* Calendar Cells */}
              <div className="cal-grid">
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e${i}`} />;
                  const ymd = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const hasDeals = dueDateMap[ymd];
                  const isToday = ymd === today;
                  const isSelected = ymd === selectedDate;
                  const isOverdue = ymd < today && hasDeals;
                  const dow = (firstDow + day - 1) % 7;

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(isSelected ? null : ymd)}
                      className={`cal-cell ${isToday ? 'cal-today' : ''} ${isSelected ? 'cal-selected' : ''}`}
                      style={{ color: dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : undefined }}
                    >
                      {day}
                      {hasDeals && (
                        <span className="cal-dot" style={{ background: isOverdue ? '#ef4444' : '#3b82f6' }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected Date Deals */}
              {selectedDate && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '10px', color: '#334155' }}>{fmtDate(selectedDate)} の案件 ({selectedDeals.length}件)</h3>
                  {selectedDeals.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '13px' }}>案件はありません</div>
                  ) : (
                    selectedDeals.map(d => (
                      <div key={d.id} style={{ padding: '10px', background: '#f8fafc', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '2px' }}>{d.client_name || '(相手不明)'}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>{d.memo}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>担当: {d.assignee_user?.name ?? '(不明)'}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      </PullToRefresh>

      {/* Help Modal */}
      {showHelp && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '440px', maxHeight: '85vh', overflowY: 'auto', marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>ヘルプ</h2>
              <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            {[
              { q: '担当者を間違えて登録してしまった', a: 'カード右下の「編集」ボタンから担当者を変更できます。「自分でやる」「誰かに任せる」を切り替えて保存してください。' },
              { q: 'メモが見つからない', a: '検索バーにキーワードを入力すると、会社名・メモ内容で絞り込めます。フィルタを「全件」に切り替えると他の人の案件も表示されます。' },
              { q: '完了にしたメモを元に戻したい', a: '下部の「完了」タブを開き、該当カードの「戻す」ボタンを押すと未着手に戻ります。' },
              { q: '通知が届かない', a: 'ヘッダー下の「プッシュ通知」をONにしてください。ブラウザの通知許可も必要です。端末の設定 > 通知 でブラウザアプリの通知が許可されているか確認してください。' },
              { q: '通知が多すぎる', a: '通知設定で「自分の案件のみ」に切り替えると、自分が担当者または作成者の案件だけ通知されます。' },
              { q: '期限切れの案件を確認したい', a: 'フィルタの「期限切れ」ボタンを押すと、期限を過ぎた未完了の案件だけ表示されます。カレンダーボタン（📅）でも日付ごとに確認できます。' },
              { q: '音声入力がうまくいかない', a: 'マイクの使用をブラウザに許可してください。静かな環境で、はっきりと話すと認識精度が上がります。顧客名は過去の登録データから自動で補正されます。' },
              { q: 'ユーザーを切り替えたい', a: 'ヘッダー右上の「切替」ボタンを押すと担当者選択画面に戻ります。' },
              { q: 'ユーザーを削除したい', a: '担当者選択画面の「ユーザーを削除」ボタンで削除モードに入ります。関連データが残っている場合は先にデータを整理してください。' },
              { q: 'アプリが固まった・表示がおかしい', a: '画面を下に引っ張って離すとデータが再読み込みされます（Pull to Refresh）。それでも直らない場合はブラウザを再起動してください。' },
              { q: 'ステータスの使い分けは？', a: '「未着手」= まだ手をつけていない案件、「対応中」= 作業を始めた案件、「完了」= 対応が終わった案件。カードのボタンでワンタップで切り替えできます。' },
              { q: 'ダッシュボードはどこ？', a: '担当者選択画面（ログイン画面）の一番上にある「ダッシュボード」ボタンから開けます。全体の状況と担当者別の件数が確認できます。' },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: '14px', padding: '12px 14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#1e293b', marginBottom: '6px' }}>Q. {item.q}</div>
                <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>A. {item.a}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button className={`nav-item ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          <span className="nav-icon">📋</span>
          一覧
        </button>
        <button className={`nav-item ${tab === 'new' ? 'active' : ''}`} onClick={() => setTab('new')}>
          <span className="nav-icon" style={{ color: '#2563eb', fontSize: '28px', transform: 'translateY(-2px)' }}>⊕</span>
          <span style={{ color: '#2563eb', fontWeight: 'bold' }}>新規</span>
        </button>
        <button className={`nav-item ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>
          <span className="nav-icon">✅</span>
          完了
        </button>
      </nav>
    </div>
  );
}
