import React, { useState, useEffect } from 'react';
import {
  Building2,
  UserCheck,
  ArrowRight,
  Mail,
  Home,
  CheckCircle2,
  RefreshCw,
  User,
  Cloud,
  LogOut,
} from 'lucide-react';
import {
  PgCase,
  UserSession,
  LandownerProfile,
  TenantApplication,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginPageProps {
  cases: PgCase[];
  onLogin: (session: UserSession) => void;
  landownerProfile: LandownerProfile;
  onSaveProfile: (profile: LandownerProfile) => void;
  onSubmitApplication?: (
    caseId: string,
    application: Omit<TenantApplication, 'id' | 'appliedAt' | 'status'>
  ) => void;
  onResetData?: () => void;
  firebaseUser?: {
    uid: string;
    email: string | null;
    displayName: string | null;
  } | null;
  onGoogleSignIn?: () => Promise<void>;
  onGoogleSignOut?: () => Promise<void>;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  cases,
  onLogin,
  landownerProfile,
  onSaveProfile,
  onSubmitApplication,
  onResetData,
  firebaseUser,
  onGoogleSignIn,
  onGoogleSignOut,
}) => {
  const [selectedRole, setSelectedRole] = useState<'owner' | 'resident'>('owner');

  const occupiedUnits = cases.filter(
    (c) => c.occupancyStatus === 'approved_occupied'
  );
  const availableUnits = cases.filter(
    (c) => c.occupancyStatus !== 'approved_occupied'
  );

  const [selectedUnitCode, setSelectedUnitCode] = useState(
    occupiedUnits[0]?.roomCode || cases[0]?.roomCode || ''
  );
  const [tenantNameInput, setTenantNameInput] = useState(
    occupiedUnits[0]?.tenantName || ''
  );
  const [tenantEmailInput, setTenantEmailInput] = useState(
    occupiedUnits[0]?.tenantEmail || ''
  );

  // Landowner state (clean — populated from saved profile or Google account)
  const [ownerNameInput, setOwnerNameInput] = useState(
    landownerProfile.fullName || firebaseUser?.displayName || ''
  );
  const [ownerEmailInput, setOwnerEmailInput] = useState(
    landownerProfile.email || firebaseUser?.email || ''
  );
  const [propertyNameInput, setPropertyNameInput] = useState(
    cases[0]?.pgName || ''
  );

  useEffect(() => {
    if (firebaseUser) {
      if (!ownerNameInput && firebaseUser.displayName) {
        setOwnerNameInput(firebaseUser.displayName);
      }
      if (!ownerEmailInput && firebaseUser.email) {
        setOwnerEmailInput(firebaseUser.email);
      }
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (landownerProfile.fullName && !ownerNameInput) {
      setOwnerNameInput(landownerProfile.fullName);
    }
    if (landownerProfile.email && !ownerEmailInput) {
      setOwnerEmailInput(landownerProfile.email);
    }
  }, [landownerProfile.fullName, landownerProfile.email]);

  useEffect(() => {
    if (occupiedUnits.length > 0 && !selectedUnitCode) {
      setSelectedUnitCode(occupiedUnits[0].roomCode);
      setTenantNameInput(occupiedUnits[0].tenantName);
      setTenantEmailInput(occupiedUnits[0].tenantEmail);
    }
  }, [occupiedUnits.length]);

  // Application modal state
  const [openApplyUnitId, setOpenApplyUnitId] = useState<string | null>(null);
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantNotes, setApplicationNotes] = useState('');
  const [appSubmittedMsg, setAppSubmittedMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleLandownerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedProfile: LandownerProfile = {
      ...landownerProfile,
      fullName: ownerNameInput.trim(),
      email: ownerEmailInput.trim(),
    };
    onSaveProfile(updatedProfile);

    const firstCase = cases[0];

    onLogin({
      role: 'owner',
      identifier: updatedProfile.email,
      name: updatedProfile.fullName,
      pgName: propertyNameInput.trim() || firstCase?.pgName || 'My Property',
      roomCode: firstCase?.roomCode || 'CONSOLE',
      activeCaseId: firstCase?.id || '',
    });
  };

  const handleTenantLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCase =
      cases.find((c) => c.roomCode === selectedUnitCode) ||
      occupiedUnits[0] ||
      cases[0];

    if (!targetCase) return;

    onLogin({
      role: 'resident',
      identifier: tenantEmailInput.trim() || targetCase.tenantEmail,
      name: tenantNameInput.trim() || targetCase.tenantName,
      pgName: targetCase.pgName,
      roomCode: targetCase.roomCode,
      activeCaseId: targetCase.id,
    });
  };

  const handleApplySubmit = (e: React.FormEvent, targetCase: PgCase) => {
    e.preventDefault();
    if (!applicantName.trim() || !applicantEmail.trim() || !onSubmitApplication)
      return;

    onSubmitApplication(targetCase.id, {
      applicantName: applicantName.trim(),
      applicantEmail: applicantEmail.trim(),
      applicantPhone: applicantPhone.trim(),
      applicantKycId: 'KYC Verified',
      moveInDate: new Date().toISOString().split('T')[0],
      stayDurationLabel: '11 Months Lease',
      notes:
        applicantNotes.trim() ||
        `Applying to rent ${targetCase.roomNo} (${targetCase.roomCode}).`,
    });

    setAppSubmittedMsg(
      `Application for ${targetCase.roomCode} submitted! Switch to Landowner Portal to accept it.`
    );
    setOpenApplyUnitId(null);
    setApplicantName('');
    setApplicantEmail('');
    setApplicantPhone('');
    setApplicationNotes('');
    setTimeout(() => setAppSubmittedMsg(null), 6000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <header className="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center font-extrabold text-white text-base shadow-sm">
            N
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900">
              Nestora
            </h1>
            <p className="text-xs text-slate-500">
              Cloud-Synced Rental & Tenancy Management Platform
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PWAInstallButton />

          {onResetData && cases.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onResetData();
                    setConfirmClear(false);
                  }}
                  className="text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-xl cursor-pointer"
                >
                  Confirm Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-xs font-semibold text-slate-600 bg-slate-200 px-2.5 py-1.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Clear All Data</span>
              </button>
            )
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl w-full mx-auto my-auto space-y-6">
        {/* Cloud Database Connection Banner */}
        <div className="bg-white border border-emerald-200/90 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-900">
                {firebaseUser
                  ? `Cloud Database Connected (${firebaseUser.email})`
                  : 'Connect Google Account for Permanent Cloud Storage'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {firebaseUser
                  ? 'All apartment units, rent receipts, complaints, and legal notices are synced to your cloud database and local device.'
                  : 'Sign in with Google to sync your apartments and records across sessions and devices, or use local storage offline.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {firebaseUser ? (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-xs border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Synced ({cases.length} Units)</span>
                </span>
                {onGoogleSignOut && (
                  <button
                    type="button"
                    onClick={onGoogleSignOut}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                    title="Disconnect Google Account"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              onGoogleSignIn && (
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sign in with Google</span>
                </button>
              )
            )}
          </div>
        </div>

        {appSubmittedMsg && (
          <div className="bg-emerald-900 text-white p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{appSubmittedMsg}</span>
          </div>
        )}

        {/* Role Selection Tabs */}
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setSelectedRole('owner')}
            className={`py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border ${
              selectedRole === 'owner'
                ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>Landowner Portal</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRole('resident')}
            className={`py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border ${
              selectedRole === 'resident'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Tenant Portal</span>
          </button>
        </div>

        {/* Selected Role Form */}
        {selectedRole === 'owner' ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm max-w-xl mx-auto space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
                <Building2 className="w-4 h-4" />
                <span>Landowner & Property Manager</span>
              </div>
              <h2 className="text-xl font-black text-slate-900">
                Landowner Management Console
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Add and manage your apartment units, verify tenant UTR payments, respond to complaints, and generate legal notices.
              </p>
            </div>

            <form onSubmit={handleLandownerLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Your Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={ownerNameInput}
                    onChange={(e) => setOwnerNameInput(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full text-xs pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Your Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={ownerEmailInput}
                    onChange={(e) => setOwnerEmailInput(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full text-xs pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Property / Building Name (Optional)
                </label>
                <div className="relative">
                  <Home className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={propertyNameInput}
                    onChange={(e) => setPropertyNameInput(e.target.value)}
                    placeholder="Enter your building or property name"
                    className="w-full text-xs pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Enter Landowner Portal</span>
                <ArrowRight className="w-4 h-4 text-emerald-400" />
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm max-w-xl mx-auto space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
                <UserCheck className="w-4 h-4" />
                <span>Tenant & Resident Portal</span>
              </div>
              <h2 className="text-xl font-black text-slate-900">
                Tenant Portal Sign In
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sign in to your assigned apartment unit to pay rent, submit UTR proofs, or raise maintenance requests.
              </p>
            </div>

            {occupiedUnits.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-3">
                <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    No Occupied Apartment Units Yet
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter the Landowner Portal first to add your apartment units and assign tenants.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRole('owner')}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>Go to Landowner Portal</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleTenantLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Select Your Apartment Unit
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {occupiedUnits.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUnitCode(u.roomCode);
                          setTenantNameInput(u.tenantName);
                          setTenantEmailInput(u.tenantEmail);
                        }}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          selectedUnitCode === u.roomCode
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-mono text-xs block">
                          {u.roomCode}
                        </span>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {u.tenantName} · {u.roomNo}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Tenant Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={tenantNameInput}
                      onChange={(e) => setTenantNameInput(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full text-xs pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Tenant Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={tenantEmailInput}
                      onChange={(e) => setTenantEmailInput(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full text-xs pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-emerald-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>Enter Tenant Portal ({selectedUnitCode})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Available Units Application Section */}
            {availableUnits.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <span className="text-xs font-bold text-slate-800 block">
                  Available Vacant Units for Application:
                </span>
                {availableUnits.map((vacant) => (
                  <div
                    key={vacant.id}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-slate-900">
                          {vacant.roomCode}
                        </span>{' '}
                        <span className="text-slate-500">
                          · {vacant.roomNo}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-emerald-700">
                        ₹{vacant.monthlyRent.toLocaleString('en-IN')}/mo
                      </span>
                    </div>

                    {openApplyUnitId === vacant.id ? (
                      <form
                        onSubmit={(e) => handleApplySubmit(e, vacant)}
                        className="space-y-2 pt-2 border-t border-slate-200"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            required
                            value={applicantName}
                            onChange={(e) => setApplicantName(e.target.value)}
                            placeholder="Your Full Name *"
                            className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                          />
                          <input
                            type="email"
                            required
                            value={applicantEmail}
                            onChange={(e) => setApplicantEmail(e.target.value)}
                            placeholder="Your Email *"
                            className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                          />
                          <input
                            type="text"
                            value={applicantPhone}
                            onChange={(e) => setApplicantPhone(e.target.value)}
                            placeholder="Phone Number"
                            className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
                          >
                            Send Application
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenApplyUnitId(null)}
                            className="px-2.5 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg cursor-pointer hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenApplyUnitId(vacant.id);
                          setApplicantName('');
                          setApplicantEmail('');
                          setApplicantPhone('');
                        }}
                        className="w-full py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                      >
                        + Submit Application for {vacant.roomCode}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center pt-6 text-xs text-slate-400">
        Nestora · Cloud-Synced Rental & Tenancy Platform
      </footer>
    </div>
  );
};
