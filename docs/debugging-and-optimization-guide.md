# デバッグ＆最適化ガイド（yasunobu-memo）

## 1. タイムライン

### Phase 1: 406エラーの修正

#### 1-1. yasunobu-memo-unread テーブルの406エラー

**原因**: `lib/unread.ts` で `.single()` を使用していた。
`.single()` は PostgREST に `Accept: application/vnd.pgrst.object+json` ヘッダーを送信する。該当ユーザーのレコードが存在しない場合（0行）、PostgREST は 406 Not Acceptable を返す。

```typescript
// ❌ Before: レコード0件で406エラー
const { data } = await supabase
  .from('yasunobu-memo-unread')
  .select('last_checked_at')
  .eq('user_id', userId)
  .single();

// ✅ After: 0件でもnullを返す
const { data } = await supabase
  .from('yasunobu-memo-unread')
  .select('last_checked_at')
  .eq('user_id', userId)
  .maybeSingle();
```

**教訓**: レコードが存在しない可能性がある場合は `.maybeSingle()` を使う。`.single()` は「必ず1行ある」場合のみ使用する。

#### 1-2. deals テーブルのJOIN 406エラー

**原因**: FK制約名にハイフンが含まれるテーブル名（`yasunobu-memo`）を使っていた。PostgREST がFK名を正しく解決できなかった。

```typescript
// ❌ Before: FK制約名ベース（ハイフン入りテーブル名で失敗）
const DEAL_SELECT = '*, created_user:users!yasunobu-memo_created_by_fkey(name)';

// ✅ After: カラム名ベース（安定）
const DEAL_SELECT = '*, created_user:users!created_by(name), assignee_user:users!assignee(name)';
```

**教訓**: Supabase JOINでは FK制約名ではなくカラム名で指定する。特にテーブル名にハイフンが含まれる場合は必須。

#### 1-3. unread テーブルのカラム名不一致

**原因**: コードが `user_name`（文字列）を使っていたが、Supabaseテーブルは `user_id`（UUID）カラムだった。

```typescript
// ❌ Before
.eq('user_name', userName)
.upsert({ user_name: userName, ... }, { onConflict: 'user_name' })

// ✅ After
.eq('user_id', userId)
.upsert({ user_id: userId, ... }, { onConflict: 'user_id' })
```

---

### Phase 2: パフォーマンス最適化

#### 2-1. select('*') の排除

**問題**: 不要なカラムを含む全カラム取得。
**影響**: レスポンスサイズ増加、転送時間増加。

```typescript
// ❌ Before
.select('*')

// ✅ After: 必要なカラムのみ
.select('id, name, sort_order')
```

#### 2-2. limit の追加

**問題**: 一覧取得にlimitがなく、データ増加で無制限にレスポンスが肥大化。

```typescript
// ❌ Before
.from('yasunobu-memo').select(DEAL_SELECT).order('created_at', { ascending: false })

// ✅ After
.from('yasunobu-memo').select(DEAL_SELECT).order('created_at', { ascending: false }).limit(200)
```

#### 2-3. useEffect 依存配列の最適化

**問題**: `loadDeals` が `me`（ユーザー名）に依存しており、ユーザー切替のたびに全案件を再フェッチしていた。`getDeals()` はユーザーに依存しないクエリ。

```typescript
// ❌ Before: meが変わるたびに再フェッチ
const loadDeals = useCallback(async () => {
  if (!isPinVerified || !me) return;
  const data = await getDeals();
  setDeals(data);
}, [isPinVerified, me]);  // ← meは不要

// ✅ After
const loadDeals = useCallback(async () => {
  if (!isPinVerified) return;
  const data = await getDeals();
  setDeals(data);
}, [isPinVerified]);
```

#### 2-4. N+1 クエリの解消

**問題**: API routeでユーザー名を取得するために2回個別にSELECTしていた。

```typescript
// ❌ Before: 2回のSELECT（N+1）
const { data: createdUser } = await supabaseAdmin
  .from('users').select('name').eq('id', created_by).single();
const { data: assigneeUser } = await supabaseAdmin
  .from('users').select('name').eq('id', deal.assignee).single();

// ✅ After: 1回のSELECTで一括取得
const userIds = [...new Set([created_by, deal.assignee])];
const { data: userRows } = await supabaseAdmin
  .from('users').select('id, name').in('id', userIds);
const userMap = new Map(userRows.map(u => [u.id, u.name]));
```

#### 2-5. 初期ロードの並列化

**問題**: `loadUsers` と `loadDeals` が別々の useEffect で逐次実行されていた。

```typescript
// ❌ Before: 逐次実行（合計時間 = users + deals）
useEffect(() => { if (isPinVerified) loadUsers(); }, [isPinVerified]);
useEffect(() => { loadDeals(); }, [loadDeals]);

// ✅ After: 並列実行（合計時間 = max(users, deals)）
useEffect(() => {
  if (!isPinVerified) return;
  Promise.all([loadUsers(), loadDeals()]);
}, [isPinVerified, loadUsers, loadDeals]);
```

#### 2-6. Supabase接続プリウォーム（最大効果）

**問題**: 初回のSupabaseリクエストでTLS接続確立に約1秒かかっていた（コールドスタート）。2回目以降は接続再利用で高速（~150ms）。

**計測結果**:
- Before: getUsers 1014ms, getDeals 1014ms
- After: getUsers 196ms, getDeals 198ms（**約5倍高速化**）

```typescript
// ✅ PIN画面表示中（ユーザーがPIN入力する間）に接続を確立
useEffect(() => {
  supabase.from('users').select('id').limit(1).then(() => {
    console.log('[perf] supabase connection warmed');
  });
  // ... PIN認証チェック
}, []);
```

#### 2-7. Push通知の非同期化

**問題**: 案件作成APIで `sendPushToAll` を `await` していたため、Push通知の送信完了までレスポンスが返らなかった。

```typescript
// ❌ Before: Push完了を待ってからレスポンス
await sendPushToAll(payload, userId, dealId);
return NextResponse.json({ deal });

// ✅ After: バックグラウンドで実行、即レスポンス
sendPushToAll(payload, userId, dealId).catch(err => {
  console.error('push error:', err);
});
return NextResponse.json({ deal });
```

#### 2-8. Service Worker の POST キャッシュエラー修正

**問題**: sw.js がPOSTリクエストもキャッシュしようとして `TypeError: Failed to execute 'put' on 'Cache'` が発生。

```javascript
// ✅ GETリクエスト以外はスキップ
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    // ... キャッシュ処理
});
```

---

## 2. 推奨SQLインデックス

```sql
-- 案件の担当者フィルタ高速化
CREATE INDEX IF NOT EXISTS idx_yasunobu_memo_assignee
  ON "yasunobu-memo"(assignee);

-- 案件の作成日ソート高速化
CREATE INDEX IF NOT EXISTS idx_yasunobu_memo_created_at
  ON "yasunobu-memo"(created_at DESC);

-- unreadの user_id 検索高速化
CREATE INDEX IF NOT EXISTS idx_yasunobu_memo_unread_user_id
  ON "yasunobu-memo-unread"(user_id);
```

---

## 3. 再利用チェックリスト

### Supabase クエリ

- [ ] `.single()` → レコード0件の可能性がある場合は `.maybeSingle()` に変更
- [ ] `.select('*')` → 必要なカラムのみ明示的に指定
- [ ] 一覧取得に `.limit()` を追加（初期値 200）
- [ ] FK JOINは制約名ではなくカラム名ベース `users!column_name(col)` で指定
- [ ] カラム名がSupabaseテーブルの実際のスキーマと一致しているか確認
- [ ] `onConflict` で指定するカラムにUNIQUE制約があるか確認

### React / Next.js

- [ ] 独立した複数のフェッチを `Promise.all` で並列化
- [ ] `useCallback` の依存配列に不要な変数が含まれていないか確認
- [ ] ページ初期化時にSupabase接続プリウォーム（軽量クエリ1発）
- [ ] `performance.now()` で計測ログを追加して実測値を確認

### API Route

- [ ] 同じテーブルへの複数SELECTを `.in()` で1回にまとめる（N+1解消）
- [ ] レスポンスに不要な非同期処理（通知送信等）を `await` しない
- [ ] エラーハンドリングで `.catch()` をバックグラウンド処理に付ける

### Service Worker

- [ ] `fetch` イベントで `event.request.method !== 'GET'` をスキップ
- [ ] Supabase APIリクエストはキャッシュしない（Network First）

### データベース

- [ ] WHERE / ORDER BY で使うカラムにインデックスを追加
- [ ] RLSが有効なテーブルにポリシーが設定されているか確認
- [ ] upsert の `onConflict` カラムにUNIQUE制約があるか確認

---

## 4. 他アプリへの移行ガイド

### Step 1: エラー修正

1. プロジェクト内の `.single()` を全検索
   ```bash
   grep -rn "\.single()" lib/ app/
   ```
2. レコードが0件になり得る箇所を `.maybeSingle()` に変更

3. Supabase JOINのFK指定を確認
   ```bash
   grep -rn "users!" lib/ app/
   ```
4. `!テーブル名_カラム名_fkey` → `!カラム名` に変更

5. テーブルのカラム名がコードと一致しているか確認
   - SupabaseのTable Editorでカラム名を確認
   - `.eq('カラム名', 値)` や `.upsert({ カラム名: 値 })` が正しいか照合

### Step 2: クエリ最適化

1. `select('*')` を検索して必要カラムのみに限定
   ```bash
   grep -rn "select\('\*'\)" lib/ app/
   ```

2. 一覧取得クエリに `.limit(200)` を追加

3. N+1クエリを特定（同じテーブルへの連続SELECT）して `.in()` に統合

### Step 3: ロード並列化

1. `page.tsx` の初期ロード部分を確認
2. 独立したフェッチを `Promise.all` でまとめる
3. 不要な `useCallback` / `useEffect` 依存を削除

### Step 4: Supabase接続プリウォーム

1. ページの最初の `useEffect` に追加:
   ```typescript
   useEffect(() => {
     supabase.from('最も軽いテーブル').select('id').limit(1);
     // ... 既存の初期化処理
   }, []);
   ```

### Step 5: API Route最適化

1. Push通知やメール送信などの非同期処理を `await` から外す
2. `.catch()` でエラーログのみ記録

### Step 6: Service Worker修正

1. `fetch` イベントの先頭に `if (event.request.method !== 'GET') return;` を追加

### Step 7: 計測ログ追加（確認用）

1. 主要クエリに `performance.now()` を追加
2. デプロイ後にコンソールで実測値を確認
3. 問題ないことを確認したらログを削除（任意）

### Step 8: インデックス追加

1. `WHERE` / `ORDER BY` で使われるカラムを特定
2. Supabase SQL Editorでインデックスを作成
3. RLSポリシーが設定されているか確認

---

## 5. 最適化の効果まとめ

| 指標 | Before | After | 改善率 |
|------|--------|-------|--------|
| initial load | 1014ms | 198ms | **5.1x** |
| getUsers | 1014ms | 196ms | **5.2x** |
| getDeals | 1014ms | 198ms | **5.1x** |
| getLastChecked | 159ms | 145ms | 1.1x |
| 406エラー | 3件 | 0件 | 解消 |
| SWキャッシュエラー | 1件 | 0件 | 解消 |
| 案件作成API | Push完了待ち | 即レスポンス | 大幅改善 |
