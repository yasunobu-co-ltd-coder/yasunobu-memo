'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Deal, Tri, AssignmentType, getDeals, createDeal, updateDeal, deleteDeal } from '../lib/deals';
import { User, getUsers, addUser, deleteUser } from '../lib/users';
import { getLastChecked, updateLastChecked } from '../lib/unread';

const TRI_SCORE: Record<Tri, number> = { 高: 3, 中: 2, 低: 1 };

// PIN認証コード
const VALID_PIN = '8004';

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

export default function Page() {
  // Auth State
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Config
  const [me, setMe] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [deleteMode, setDeleteMode] = useState(false);
  const [newUserName, setNewUserName] = useState('');

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

  // Notifications
  const [showNotif, setShowNotif] = useState(false);
  const [lastCheckedNotif, setLastCheckedNotif] = useState<string | null>(null);

  // Calendar
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calFilter, setCalFilter] = useState<'全件' | '自分担当'>('自分担当');

  // Voice Input
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Check PIN from sessionStorage on mount
  useEffect(() => {
    const verified = sessionStorage.getItem('matip_pin_verified');
    if (verified === 'true') {
      setIsPinVerified(true);
    }
  }, []);

  // Load users from Supabase
  const loadUsers = useCallback(async () => {
    const data = await getUsers();
    setUsers(data);
  }, []);

  useEffect(() => {
    if (isPinVerified) loadUsers();
  }, [isPinVerified, loadUsers]);

  // Load deals from Supabase
  const loadDeals = useCallback(async () => {
    if (!isPinVerified || !me) return;
    setLoading(true);
    const data = await getDeals();
    setDeals(data);
    setLoading(false);
  }, [isPinVerified, me]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  // PIN verification handler
  const handlePinSubmit = () => {
    if (pin === VALID_PIN) {
      setIsPinVerified(true);
      sessionStorage.setItem('matip_pin_verified', 'true');
      setPinError('');
    } else {
      setPinError('PINコードが正しくありません');
    }
  };

  // Login handler
  const handleLogin = (name: string) => {
    setMe(name);
    localStorage.setItem('matip_me', name);
    setAssignee(name);
  };

  const logout = () => {
    setMe('');
    localStorage.removeItem('matip_me');
  };

  // Add user to Supabase
  const handleAddUser = async () => {
    const trimmed = newUserName.trim();
    if (!trimmed) return;
    if (users.some(u => u.name === trimmed)) {
      alert('このユーザーは既に存在します');
      return;
    }
    const created = await addUser(trimmed);
    if (created) {
      setUsers([...users, created]);
      setNewUserName('');
    } else {
      alert('ユーザーの追加に失敗しました');
    }
  };

  // Remove user from Supabase with task check
  const removeUser = async (user: User) => {
    if (users.length <= 1) {
      alert('最低1人のユーザーが必要です');
      return;
    }

    // Check if user has assigned tasks in Supabase (open or done)
    const allDeals = await getDeals();
    const userTasks = allDeals.filter(d => d.assignee === user.name);
    if (userTasks.length > 0) {
      alert(`「${user.name}」には${userTasks.length}件の案件があるため削除できません。\n案件をすべて削除してから再度お試しください。`);
      return;
    }

    if (!confirm(`「${user.name}」を削除しますか？`)) return;
    const ok = await deleteUser(user.id);
    if (ok) {
      setUsers(users.filter(u => u.id !== user.id));
    } else {
      alert('ユーザーの削除に失敗しました');
    }
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

  // Submit new deal
  const submit = async () => {
    if (!me) return;
    const newDeal = {
      created_by: me,
      client_name: clientName.trim(),
      memo: memo.trim(),
      due_date: dueDate,
      importance,
      profit,
      urgency,
      assignment_type: assignmentType,
      assignee: assignmentType === '自分で' ? me : assignee,
      status: 'open' as const,
    };

    const created = await createDeal(newDeal);
    if (created) {
      setDeals([created, ...deals]);
    }

    // Reset & Nav
    setClientName('');
    setMemo('');
    setDueDate(todayYmd());
    setImportance('中');
    setTab('list');
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
    const updated = await updateDeal(id, { status: 'open' });
    if (updated) {
      setDeals(deals.map(d => d.id === id ? updated : d));
    }
  };

  // Delete deal permanently
  const handleDelete = async (id: string) => {
    if (!confirm('この案件を完全に削除しますか？')) return;
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
  };

  // Save edit
  const saveEdit = async () => {
    if (!editingDeal) return;
    const updated = await updateDeal(editingDeal.id, {
      client_name: editClientName,
      memo: editMemo,
      due_date: editDueDate,
      importance: editImportance,
      profit: editProfit,
      urgency: editUrgency,
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
    if (!me) return;
    getLastChecked(me).then(val => setLastCheckedNotif(val));
  }, [me]);

  // Notifications: deals assigned to me by others
  const notifications = useMemo(() => {
    return deals.filter(d => d.assignee === me && d.created_by !== me);
  }, [deals, me]);

  const unreadCount = useMemo(() => {
    if (!lastCheckedNotif) return notifications.length;
    return notifications.filter(d => d.created_at > lastCheckedNotif).length;
  }, [notifications, lastCheckedNotif]);

  const openNotif = async () => {
    setShowNotif(true);
    await updateLastChecked(me);
    setLastCheckedNotif(new Date().toISOString());
  };

  // Filter Logic
  const filtered = useMemo(() => {
    const now = todayYmd();
    let list = deals.filter(d => tab === 'done' ? d.status === 'done' : d.status === 'open');

    if (query) {
      list = list.filter(d => (d.client_name || '').includes(query) || (d.memo || '').includes(query));
    }

    if (filter === '自分担当' && me) list = list.filter(d => d.assignee === me);
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
        <div className="login-card">
          <h1 className="brand" style={{ textAlign: 'center', fontSize: '24px', marginBottom: '8px' }}>matip</h1>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '32px' }}>PINコードを入力してください</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              className="input-field"
              style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', width: '150px' }}
              placeholder="____"
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
      <div className="login-screen">
        <div className="login-card">
          <h1 className="brand" style={{ textAlign: 'center', fontSize: '24px', marginBottom: '8px' }}>matip</h1>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '32px' }}>担当者を選択して開始</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {users.map(u => (
              <div key={u.id} style={{ position: 'relative' }}>
                <button
                  className="glass-panel"
                  style={{ width: '100%', padding: '16px', borderRadius: '12px', border: deleteMode ? '2px solid #ef4444' : 'none', cursor: 'pointer', fontWeight: 'bold', color: '#334155' }}
                  onClick={() => deleteMode ? removeUser(u) : handleLogin(u.name)}
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
          <div className="brand">matip <span style={{ fontSize: '10px', opacity: 0.7 }}>v1.1</span></div>
          <button onClick={openNotif} className="notif-bell">
            🔔
            {notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}
          </button>
          <button onClick={() => { setShowCalendar(true); setSelectedDate(null); }} className="notif-bell">
            📅
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className="user-badge" onClick={logout}>{me}</span>
        </div>
      </header>

      {/* Content Area */}
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
              <label className="input-label">誰からの案件？ (会社名/担当者)</label>
              <input
                className="input-field"
                placeholder="例: A社 山田さん"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="input-label">内容 (メモ)</label>
              <textarea
                className="input-field"
                rows={4}
                placeholder="要件を入力..."
                value={memo}
                onChange={e => setMemo(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="input-label">期限</label>
              <input
                type="date"
                className="input-field"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div>
                <label className="input-label">重要度</label>
                <select className="input-field" value={importance} onChange={e => setImportance(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
              <div>
                <label className="input-label">急ぎ</label>
                <select className="input-field" value={urgency} onChange={e => setUrgency(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
              <div>
                <label className="input-label">利益度</label>
                <select className="input-field" value={profit} onChange={e => setProfit(e.target.value as Tri)}>
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
                <select className="input-field" value={assignee} onChange={e => setAssignee(e.target.value)}>
                  {users.filter(u => u.name !== me).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              )}
            </div>

            <button className="primary-btn" onClick={submit} disabled={!memo.trim()}>
              登録する
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
              <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>並び替え</label>
              <select
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
                  <span className="due-badge" style={{ color: d.due_date < todayYmd() && d.status === 'open' ? '#ef4444' : '#64748b' }}>
                    期限: {fmtDate(d.due_date)}
                  </span>

                  <div className="client-name">{d.client_name || '(相手不明)'}</div>

                  <div className="indicators">
                    <span className={`tag ${d.importance === '高' ? 'tag-hi' : d.importance === '中' ? 'tag-mid' : 'tag-lo'}`}>重要:{d.importance}</span>
                    <span className={`tag ${d.urgency === '高' ? 'tag-hi' : d.urgency === '中' ? 'tag-mid' : 'tag-lo'}`}>急ぎ:{d.urgency}</span>
                    <span className={`tag ${d.profit === '高' ? 'tag-hi' : d.profit === '中' ? 'tag-mid' : 'tag-lo'}`}>利益:{d.profit}</span>
                  </div>

                  <div className="memo-text">{d.memo}</div>

                  <div className="assignee-row">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.assignee === me ? '#3b82f6' : '#cbd5e1' }} />
                      {d.assignee}
                    </span>

                    {d.status === 'open' ? (
                      <>
                        <button
                          onClick={() => startEdit(d)}
                          style={{ background: '#f1f5f9', color: '#64748b', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', marginRight: '8px' }}
                        >
                          編集
                        </button>
                        <button
                          onClick={() => markDone(d.id)}
                          style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          完了する
                        </button>
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
              <label className="input-label">会社名/担当者</label>
              <input className="input-field" value={editClientName} onChange={e => setEditClientName(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="input-label">内容</label>
              <textarea className="input-field" rows={3} value={editMemo} onChange={e => setEditMemo(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="input-label">期限</label>
              <input type="date" className="input-field" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div>
                <label className="input-label">重要度</label>
                <select className="input-field" value={editImportance} onChange={e => setEditImportance(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
              <div>
                <label className="input-label">急ぎ</label>
                <select className="input-field" value={editUrgency} onChange={e => setEditUrgency(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
              <div>
                <label className="input-label">利益度</label>
                <select className="input-field" value={editProfit} onChange={e => setEditProfit(e.target.value as Tri)}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
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
                    {d.created_by} さんから依頼
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>{d.client_name || '(相手不明)'}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>{d.memo}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: d.due_date < todayYmd() ? '#ef4444' : '#64748b' }}>期限: {fmtDate(d.due_date)}</span>
                    <span className={`tag ${d.status === 'done' ? 'tag-lo' : 'tag-mid'}`} style={{ fontSize: '11px' }}>{d.status === 'done' ? '完了' : '対応中'}</span>
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
        const calDeals = deals.filter(d => d.status === 'open' && (calFilter === '全件' || d.assignee === me));
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
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>担当: {d.assignee}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
