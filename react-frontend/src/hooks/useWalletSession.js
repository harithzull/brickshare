import { useEffect, useRef, useState } from 'react';

const anonymous = { session: null, status: 'anonymous', error: null };
export default function useWalletSession({ client, wallet, expectedChainId, ethereum = typeof window !== 'undefined' ? window.ethereum : null }) {
  const [state, setState] = useState({ ...anonymous, status: client?.settings.baseUrl ? 'restoring' : 'disabled' });
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0); const current = useRef(null); const operation = useRef(null); const action = useRef(false);
  const mounted = useRef(true);
  const clear = () => { current.current = null; if (mounted.current) setState(anonymous); };
  const matches = async session => {
    if (!ethereum?.request) return true; // Session restoration itself does not request a connection.
    const [accounts, chain] = await Promise.all([ethereum.request({ method: 'eth_accounts' }), ethereum.request({ method: 'eth_chainId' })]);
    return accounts[0]?.toLowerCase() === session.wallet.address.toLowerCase() && String(Number(chain)) === session.wallet.chainId;
  };
  const reset = () => {
    const version = ++epoch.current; operation.current?.abort(); action.current = true; clear(); if (mounted.current) setBusy(true);
    // Clear local privileges immediately. Server revocation is best effort if offline.
    Promise.resolve(client?.settings.baseUrl ? client.logout() : undefined)
      .catch(() => { if (mounted.current && version === epoch.current) setState({ ...anonymous, error: 'Signed out locally. The API could not confirm session revocation; retry sign-out when it is available.' }); })
      .finally(() => { if (version === epoch.current) { action.current = false; if (mounted.current) setBusy(false); } });
  };
  const restore = async () => {
    if (!client?.settings.baseUrl || action.current) return;
    const version = epoch.current;
    try {
      const session = await client.me();
      if (!mounted.current || version !== epoch.current) return;
      if (session.authenticated && Date.parse(session.expiresAt) > Date.now() && await matches(session)) {
        if (!mounted.current || version !== epoch.current) return;
        current.current = session; setState({ session, status: 'signed_in', error: null });
      } else {
        clear(); if (session.authenticated) await client.logout();
      }
    } catch (error) { if (mounted.current && version === epoch.current) { current.current = null; setState({ ...anonymous, error: error.message }); } }
  };
  useEffect(() => {
    mounted.current = true; restore();
    const changed = () => reset();
    ethereum?.on?.('accountsChanged', changed); ethereum?.on?.('chainChanged', changed); ethereum?.on?.('disconnect', changed);
    const timer = setInterval(() => restore(), 30000);
    const expiry = setInterval(() => { if (current.current && Date.parse(current.current.expiresAt) <= Date.now()) reset(); }, 1000);
    return () => { mounted.current = false; epoch.current++; operation.current?.abort(); clearInterval(timer); clearInterval(expiry); ethereum?.removeListener?.('accountsChanged', changed); ethereum?.removeListener?.('chainChanged', changed); ethereum?.removeListener?.('disconnect', changed); };
  }, [client, ethereum]);
  useEffect(() => { if (wallet && current.current && wallet.account.toLowerCase() !== current.current.wallet.address.toLowerCase()) reset(); }, [wallet?.account]);

  const signIn = async () => {
    if (action.current || !wallet || !client?.settings.baseUrl) return;
    action.current = true; const version = ++epoch.current; operation.current?.abort(); const controller = new AbortController(); operation.current = controller; setBusy(true);
    try {
      const network = await wallet.provider.getNetwork();
      if (network.chainId !== expectedChainId) throw new Error('Select the configured wallet network before signing in.');
      const challenge = await client.nonce(wallet.account, network.chainId, controller.signal);
      const beforeSign = await matches({ wallet: { address: wallet.account, chainId: String(network.chainId) } });
      if (version !== epoch.current || !beforeSign) throw new Error('Wallet changed before sign-in.');
      // EIP-191 personal message only: this never calls sendTransaction or eth_sign.
      const signature = await wallet.signer.signMessage(challenge.message);
      const afterSign = await matches({ wallet: { address: wallet.account, chainId: String(network.chainId) } });
      if (version !== epoch.current || !afterSign) throw new Error('Wallet changed while signing.');
      await client.verify(challenge, signature, controller.signal);
      const session = await client.me(controller.signal);
      const afterVerify = session.authenticated && await matches(session);
      if (version !== epoch.current || !afterVerify) { await client.logout(); return; }
      current.current = session; if (mounted.current) setState({ session, status: 'signed_in', error: null });
    } catch (error) {
      if (mounted.current && version === epoch.current) { current.current = null; setState({ ...anonymous, error: error.code === 4001 || error.code === 'ACTION_REJECTED' ? 'You cancelled the sign-in message. Wallet transactions are separate.' : error.code === 'aborted' ? null : error.message || 'Wallet sign-in failed.' }); }
    } finally { if (version === epoch.current) { action.current = false; if (mounted.current) setBusy(false); } }
  };
  const logout = async () => {
    epoch.current++; operation.current?.abort(); clear(); action.current = true; setBusy(true);
    try { await client?.logout(); }
    catch { if (mounted.current) setState({ ...anonymous, error: 'Signed out locally, but server logout was not confirmed. Retry when the API is available.' }); }
    finally { action.current = false; if (mounted.current) setBusy(false); }
  };
  const disconnect = () => { if (current.current || busy) reset(); };
  return { ...state, busy, client, signIn, logout, disconnect, refresh: restore };
}
