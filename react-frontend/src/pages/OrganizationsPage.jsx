import { useEffect, useRef, useState } from 'react';
import { Button, EmptyState, Notice, PageHeader } from '../components/ui';
import { shortAddress } from '../lib/marketplace';

export default function OrganizationsPage({ auth }) {
  const [organizations, setOrganizations] = useState([]); const [inbox, setInbox] = useState([]);
  const [selected, setSelected] = useState(''); const [members, setMembers] = useState([]); const [current, setCurrent] = useState(null);
  const [pending, setPending] = useState([]); const [audit, setAudit] = useState([]); const [directory, setDirectory] = useState([]);
  const [name, setName] = useState(''); const [rename, setRename] = useState(''); const [address, setAddress] = useState(''); const [role, setRole] = useState('viewer');
  const [error, setError] = useState(null); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    const version = ++epoch.current; const controller = new AbortController();
    setOrganizations([]); setInbox([]); setMembers([]); setCurrent(null); setPending([]); setAudit([]); setDirectory([]); setError(null);
    if (!auth.session) return () => controller.abort();
    Promise.all([auth.client.organizations(controller.signal), auth.client.inbox(controller.signal), auth.session.user.platformRole === 'platform_admin' ? auth.client.directory(controller.signal) : Promise.resolve({ data: [] })])
      .then(([orgs, invites, platform]) => {
        if (version !== epoch.current) return;
        setOrganizations(orgs.data); setInbox(invites.data); setDirectory(platform.data);
        setSelected(value => orgs.data.some(org => org.id === value) ? value : orgs.data[0]?.id || '');
      }).catch(problem => { if (version === epoch.current && problem.code !== 'aborted') setError(problem.message); });
    return () => { epoch.current++; controller.abort(); };
  }, [auth.session?.user.id, auth.session?.user.platformRole, revision, auth.client]);
  useEffect(() => {
    const controller = new AbortController(); let valid = true;
    setMembers([]); setCurrent(null); setPending([]); setAudit([]);
    if (!auth.session || !selected) return () => controller.abort();
    const run = async () => {
      try {
        const response = await auth.client.members(selected, controller.signal);
        if (!valid) return;
        setCurrent(response.organization); setRename(response.organization.name); setMembers(response.data);
        if (response.organization.permissions.manageInvitations) {
          const [invites, logs] = await Promise.all([auth.client.invitations(selected, controller.signal), auth.client.audit(selected, controller.signal)]);
          if (valid) { setPending(invites.data); setAudit(logs.data); }
        }
      } catch (problem) { if (valid && problem.code !== 'aborted') setError(problem.message); }
    };
    run(); return () => { valid = false; controller.abort(); };
  }, [selected, auth.session?.user.id, revision, auth.client]);
  const mutate = async task => {
    if (busy) return; const version = epoch.current; setBusy(true); setError(null);
    try { await task(); if (version === epoch.current) { await auth.refresh(); setRevision(value => value + 1); } }
    catch (problem) { if (version === epoch.current) setError(problem.message); }
    finally { setBusy(false); }
  };
  if (!auth.session) return <div className="page"><PageHeader title="Organization workspace" eyebrow="BRICKSHARE STUDIO" /><EmptyState title="Sign in to view organizations">Connect your wallet, then use “Sign in with wallet”. Application roles are separate from contract ownership.</EmptyState></div>;
  return <div className="page organizations-page">
    <PageHeader title="Your organizations" eyebrow="BRICKSHARE STUDIO" description="Private organization access is checked by the backend. These roles never authorize a blockchain transaction." actions={<Button variant="secondary" onClick={() => setRevision(value => value + 1)} disabled={busy}>Refresh organizations</Button>} />
    {error && <Notice tone="warning" role="alert">{error}</Notice>}
    <section className="panel organization-section">
      <h2>Create an organization</h2><p className="small muted">Use fictional names for local demonstrations. Creating an organization makes you its application owner, not a contract owner.</p>
      <form onSubmit={event => { event.preventDefault(); mutate(async () => { await auth.client.createOrganization(name); setName(''); }); }}>
        <label htmlFor="organization-name">Organization name</label><input id="organization-name" value={name} onChange={event => setName(event.target.value)} minLength={3} maxLength={100} placeholder="FICTIONAL Cedar Studio" required />
        <Button type="submit" disabled={busy}>Create organization</Button>
      </form>
    </section>
    {inbox.length > 0 && <section className="panel organization-section"><h2>Invitations for this wallet</h2>{inbox.map(invite => <div className="organization-row" key={invite.id}><span>{invite.organizationName} · {invite.role}</span><Button variant="secondary" disabled={busy} onClick={() => mutate(() => auth.client.accept(invite.id))}>Accept invitation</Button></div>)}</section>}
    {organizations.length ? <>
      <label htmlFor="organization-select">Select organization</label><select id="organization-select" value={selected} onChange={event => { setSelected(event.target.value); setError(null); }}>{organizations.map(org => <option key={org.id} value={org.id}>{org.name} · {org.role}</option>)}</select>
      {current && <section className="panel organization-section">
        <h2>{current.name}</h2><p>Your organization role: <strong>{current.role}</strong></p>
        {current.permissions.editOrganization && <form onSubmit={event => { event.preventDefault(); mutate(() => auth.client.renameOrganization(selected, rename)); }}><label htmlFor="organization-rename">Organization name</label><input id="organization-rename" value={rename} onChange={event => setRename(event.target.value)} minLength={3} maxLength={100} required /><Button type="submit" disabled={busy}>Save name</Button></form>}
        <h3>Members</h3>
        {members.map(member => <div className="organization-row" key={member.id}>
          <span title={member.address}>{member.displayName || shortAddress(member.address)} · {member.role}</span>
          {current.permissions.manageMembers && <div className="session-actions"><label className="sr-only" htmlFor={'role-' + member.id}>Role for {member.address}</label><select id={'role-' + member.id} value={member.role} disabled={busy} onChange={event => mutate(() => auth.client.changeRole(selected, member.id, event.target.value))}><option value="owner">owner</option><option value="editor">editor</option><option value="viewer">viewer</option></select><Button variant="secondary" disabled={busy} onClick={() => mutate(() => auth.client.removeMember(selected, member.id))}>Remove member</Button></div>}
        </div>)}
        {current.permissions.manageInvitations && <>
          <h3>Invite a wallet</h3><p className="small muted">Only that verified wallet can accept. Invitations expire in 48 hours. Promote owners separately after they join.</p>
          <form onSubmit={event => { event.preventDefault(); mutate(async () => { await auth.client.invite(selected, address, role); setAddress(''); }); }}>
            <label htmlFor="invite-address">Wallet address</label><input id="invite-address" value={address} onChange={event => setAddress(event.target.value)} pattern="0x[0-9a-fA-F]{40}" required />
            <label htmlFor="invite-role">Organization role</label><select id="invite-role" value={role} onChange={event => setRole(event.target.value)}><option value="viewer">viewer</option><option value="editor">editor</option></select><Button type="submit" disabled={busy}>Create invitation</Button>
          </form>
          {pending.map(invite => <div className="organization-row" key={invite.id}><span>{shortAddress(invite.address)} · {invite.role}</span><Button variant="secondary" disabled={busy} onClick={() => mutate(() => auth.client.revoke(selected, invite.id))}>Revoke invitation</Button></div>)}
        </>}
        {current.permissions.readAudit && <><h3>Security history</h3><ul>{audit.map(entry => <li key={entry.id}>{entry.action} · {new Date(entry.createdAt).toLocaleString()}</li>)}</ul></>}
      </section>}
    </> : <EmptyState title="No organizations yet">Create a fictional organization or accept an invitation addressed to your signed-in wallet.</EmptyState>}
    {auth.session.user.platformRole === 'platform_admin' && <section className="panel organization-section"><h2>Platform organization directory</h2><p className="small muted">This directory does not grant access to other organizations’ members or audit history.</p><ul>{directory.map(org => <li key={org.id}>{org.name}</li>)}</ul></section>}
  </div>;
}
