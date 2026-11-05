import { Button, Notice } from './ui';
import { shortAddress } from '../lib/marketplace';

export default function WalletSessionPanel({ auth, app, navigate }) {
  return (
    <section className="panel session-panel" aria-label="Application sign-in">
      <div>
        <strong>{auth.session ? `Signed in · ${shortAddress(auth.session.wallet.address)}` : auth.status === 'restoring' ? 'Restoring application session…' : 'Wallet connection and sign-in are separate'}</strong>
        <p className="small muted">{auth.session ? `${auth.session.user.platformRole === 'platform_admin' ? 'Platform administrator' : 'Investor'} · session expires ${new Date(auth.session.expiresAt).toLocaleTimeString()}. Organization roles do not grant contract permissions.` : 'Connect to use the blockchain. Sign in with a message to manage organizations. Approve transactions separately in your wallet.'}</p>
        {auth.status === 'disabled' && <p className="small muted">Enable VITE_API_BASE_URL to use application sign-in. Browsing and wallet transactions remain available.</p>}
        {auth.status !== 'disabled' && !auth.session && <p className="small muted">Standard EOA wallets are supported. Smart-contract wallet sign-in is not enabled yet.</p>}
        {auth.error && <Notice tone="warning" role="alert">{auth.error}</Notice>}
      </div>
      <div className="session-actions">
        {auth.session ? <>
          <Button type="button" variant="secondary" onClick={() => navigate('organizations')}>Organizations</Button>
          <Button type="button" variant="secondary" disabled={auth.busy} onClick={auth.logout}>Sign out</Button>
        </> : auth.status !== 'disabled' && <Button type="button" disabled={!app.wallet || app.busy || auth.busy || auth.status === 'restoring'} onClick={auth.signIn}>{auth.busy ? 'Waiting for sign-in message…' : 'Sign in with wallet'}</Button>}
      </div>
    </section>
  );
}
