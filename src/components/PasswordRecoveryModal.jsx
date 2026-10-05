import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from './ToastContext';

export default function PasswordRecoveryModal({ lang, onClose }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const { showError, showSuccess } = useToast();
  const vi = lang === 'vi';
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) {
      showError(vi ? 'Hai mật khẩu chưa khớp.' : 'The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showSuccess(vi ? 'Đã cập nhật mật khẩu.' : 'Password updated.');
      onClose();
    } catch (error) { showError(error.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4">
      <section role="dialog" aria-modal="true" aria-labelledby="recovery-title" className="w-full max-w-md rounded-3xl p-6 shadow-2xl" style={{ background: 'var(--surface-card)', color: 'var(--text-primary)' }}>
        <h2 id="recovery-title" className="text-xl font-bold mb-5">{vi ? 'Đặt lại mật khẩu' : 'Reset password'}</h2>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label>{vi ? 'Mật khẩu mới' : 'New password'}
            <input name="newPassword" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border p-3 text-gray-900" />
          </label>
          <label>{vi ? 'Nhập lại mật khẩu' : 'Confirm password'}
            <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={6} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-xl border p-3 text-gray-900" />
          </label>
          <button disabled={busy} type="submit" className="w-full rounded-xl bg-green-600 p-3 font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-60">{vi ? 'Lưu mật khẩu' : 'Save password'}</button>
          <button disabled={busy} type="button" onClick={onClose} className="w-full rounded-xl p-2 transition-colors hover:bg-gray-500/10">{vi ? 'Đóng' : 'Close'}</button>
        </form>
      </section>
    </div>
  );
}
