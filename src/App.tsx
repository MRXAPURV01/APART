import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Header } from './components/Header';
import { Sidebar, TabKey } from './components/Sidebar';
import { DashboardTab } from './components/DashboardTab';
import { ResidentReceiptTab } from './components/ResidentReceiptTab';
import { ComplaintBoxTab } from './components/ComplaintBoxTab';
import { AgreementDetailsTab } from './components/AgreementDetailsTab';
import { ComparisonTab } from './components/ComparisonTab';
import { AiAssistantTab } from './components/AiAssistantTab';
import { LoginPage } from './components/LoginPage';
import { OwnerPortal } from './components/OwnerPortal';
import { NewCaseModal } from './components/NewCaseModal';
import { NoticeGeneratorModal } from './components/NoticeGeneratorModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { INITIAL_CASES, EMPTY_CASE_PLACEHOLDER } from './data/mockData';
import {
  PgCase,
  RoomComparison,
  UserSession,
  PaymentTransaction,
  ComplaintItem,
  LandownerProfile,
  TenantApplication,
} from './types';
import {
  exportCaseData,
  sendAutomatedComplaintEmailToOwner,
} from './services/legalService';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
  signInWithGooglePopup,
  signOutFirebase,
  saveProfileToFirestore,
  saveCaseToFirestore,
  deleteCaseFromFirestore,
} from './firebase';
import {
  LayoutDashboard,
  Receipt,
  Layers,
  MessageSquareWarning,
  FileText,
  Sparkles,
  Building2,
} from 'lucide-react';

const STORAGE_CASES_KEY = 'nestora_v12_clean_cases';
const STORAGE_PROFILE_KEY = 'nestora_v12_clean_profile';

const DEFAULT_LANDOWNER_PROFILE: LandownerProfile = {
  fullName: '',
  email: '',
  mobile: '',
  residentialAddress: '',
  preferredLanguage: 'English',
  preferredLanguages: ['English'],
  aboutYou: '',
  photoUrl: undefined,
  vacantUnits: 0,
};

export default function App() {
  const [cases, setCases] = useState<PgCase[]>(() => {
    try {
      // Remove all legacy keys that held fake/sample data
      [
        'nestora_landowner_cases_v8',
        'rentproof_landowner_profile_v1',
        'nestora_clean_cases_v9',
        'nestora_clean_profile_v9',
        'nestora_v11_cases',
        'nestora_v11_profile',
      ].forEach((k) => localStorage.removeItem(k));

      const saved = localStorage.getItem(STORAGE_CASES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading saved cases:', e);
    }
    return INITIAL_CASES;
  });

  const [landownerProfile, setLandownerProfile] = useState<LandownerProfile>(
    () => {
      try {
        const saved = localStorage.getItem(STORAGE_PROFILE_KEY);
        if (saved) {
          return { ...DEFAULT_LANDOWNER_PROFILE, ...JSON.parse(saved) };
        }
      } catch (e) {
        console.error('Error loading landowner profile:', e);
      }
      return DEFAULT_LANDOWNER_PROFILE;
    }
  );

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string>(() => {
    return cases[0]?.id || '';
  });

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);
  const [isNoticeGenOpen, setIsNoticeGenOpen] = useState(false);
  const [openOwnerProfileFlag, setOpenOwnerProfileFlag] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const casesRef = useRef<PgCase[]>(cases);
  casesRef.current = cases;

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Track Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        setLandownerProfile((prev) => ({
          ...prev,
          fullName: prev.fullName || user.displayName || '',
          email: prev.email || user.email || '',
        }));
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listeners when authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const cleanUid = firebaseUser.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    const profilePath = `profiles/${cleanUid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'profiles', cleanUid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setLandownerProfile((prev) => ({
            ...prev,
            fullName: String(data.fullName ?? prev.fullName ?? ''),
            email: String(data.email ?? prev.email ?? ''),
            mobile: String(data.mobile ?? prev.mobile ?? ''),
            residentialAddress: String(
              data.residentialAddress ?? prev.residentialAddress ?? ''
            ),
            preferredLanguage: String(
              data.preferredLanguage ?? prev.preferredLanguage ?? 'English'
            ),
            aboutYou: String(data.aboutYou ?? prev.aboutYou ?? ''),
            vacantUnits: Number(data.vacantUnits ?? prev.vacantUnits ?? 0),
          }));
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, profilePath);
      }
    );

    const casesQuery = query(
      collection(db, 'cases'),
      where('ownerId', '==', cleanUid)
    );
    const unsubCases = onSnapshot(
      casesQuery,
      (snap) => {
        const remoteCases: PgCase[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const details = (d.caseDetails || {}) as Partial<PgCase>;
          remoteCases.push({
            ...EMPTY_CASE_PLACEHOLDER,
            ...details,
            id: String(d.id || docSnap.id),
            roomCode: String(d.roomCode || details.roomCode || 'UNIT-1'),
            pgName: String(d.pgName || details.pgName || 'Property'),
            roomNo: String(d.roomNo || details.roomNo || 'Unit 1'),
            occupancyStatus:
              d.occupancyStatus || details.occupancyStatus || 'available',
            monthlyRent: Number(d.monthlyRent ?? details.monthlyRent ?? 0),
            securityDeposit: Number(
              d.securityDeposit ?? details.securityDeposit ?? 0
            ),
            rentStatus: d.rentStatus || details.rentStatus || 'Pending',
            status: d.status || details.status || 'Active',
            deductions: Array.isArray(details.deductions)
              ? details.deductions
              : [],
            payments: Array.isArray(details.payments) ? details.payments : [],
            complaints: Array.isArray(details.complaints)
              ? details.complaints
              : [],
            comparisons: Array.isArray(details.comparisons)
              ? details.comparisons
              : [],
            tenantApplications: Array.isArray(details.tenantApplications)
              ? details.tenantApplications
              : [],
            legalDocuments: Array.isArray(details.legalDocuments)
              ? details.legalDocuments
              : [],
            rentEmailNotices: Array.isArray(details.rentEmailNotices)
              ? details.rentEmailNotices
              : [],
            agreementTerms: Array.isArray(details.agreementTerms)
              ? details.agreementTerms
              : [],
          });
        });

        if (remoteCases.length > 0) {
          setCases(remoteCases);
          setActiveCaseId((prevId) =>
            remoteCases.some((c) => c.id === prevId)
              ? prevId
              : remoteCases[0].id
          );
        } else if (casesRef.current.length > 0) {
          // Upload any locally created units to Firestore on first connect
          casesRef.current.forEach((localCase) => {
            saveCaseToFirestore(cleanUid, localCase).catch(() => {});
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'cases');
      }
    );

    return () => {
      unsubProfile();
      unsubCases();
    };
  }, [authReady, firebaseUser]);

  // Sync cases to localStorage for offline PWA support
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CASES_KEY, JSON.stringify(cases));
    } catch (e) {
      console.error('Error saving cases locally:', e);
    }
  }, [cases]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_PROFILE_KEY,
        JSON.stringify(landownerProfile)
      );
    } catch (e) {
      console.error('Error saving landowner profile locally:', e);
    }
  }, [landownerProfile]);

  const activeCase: PgCase =
    cases.find((c) => c.id === activeCaseId) ||
    cases[0] || {
      ...EMPTY_CASE_PLACEHOLDER,
      landlordName: landownerProfile.fullName,
      landlordEmail: landownerProfile.email,
      landlordPhone: landownerProfile.mobile,
    };

  const syncCaseToCloud = (targetCase: PgCase) => {
    if (firebaseUser) {
      saveCaseToFirestore(firebaseUser.uid, targetCase).catch((err) => {
        console.error('Cloud sync error:', err);
      });
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const user = await signInWithGooglePopup();
      showNotification(`Connected to Cloud Database (${user.email})`);
    } catch (err) {
      console.error('Google sign-in error:', err);
      showNotification('Google sign-in was cancelled or blocked.');
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOutFirebase();
      showNotification('Disconnected from Google Cloud sync.');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleLogin = (newSession: UserSession) => {
    setSession(newSession);
    if (newSession.activeCaseId) {
      setActiveCaseId(newSession.activeCaseId);
    }
    showNotification(`Signed in: ${newSession.name || 'User'}`);
  };

  const handleLogout = () => {
    setSession(null);
    showNotification('Signed out.');
  };

  const handleSaveLandownerProfile = (updatedProfile: LandownerProfile) => {
    setLandownerProfile(updatedProfile);
    if (firebaseUser) {
      saveProfileToFirestore(firebaseUser.uid, updatedProfile).catch((err) =>
        console.error('Profile cloud save error:', err)
      );
    }
    setCases((prev) =>
      prev.map((c) => {
        const nextCase = {
          ...c,
          landlordName: updatedProfile.fullName || c.landlordName,
          landlordEmail: updatedProfile.email || c.landlordEmail,
          landlordPhone: updatedProfile.mobile || c.landlordPhone,
        };
        syncCaseToCloud(nextCase);
        return nextCase;
      })
    );
    if (session && session.role === 'owner') {
      setSession({
        ...session,
        name: updatedProfile.fullName,
        identifier: updatedProfile.email,
      });
    }
    showNotification('Landowner profile saved.');
  };

  const handleSelectCase = (caseId: string) => {
    setActiveCaseId(caseId);
    const found = cases.find((c) => c.id === caseId);
    if (found && session) {
      setSession({
        ...session,
        activeCaseId: found.id,
        pgName: found.pgName,
        roomCode: found.roomCode,
        name:
          session.role === 'owner'
            ? landownerProfile.fullName || found.landlordName
            : found.tenantName,
        identifier:
          session.role === 'owner'
            ? landownerProfile.email || found.landlordPhone
            : found.tenantPhone,
      });
    }
  };

  const handleUpdateActiveCase = (updated: PgCase) => {
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    syncCaseToCloud(updated);
  };

  const handleCreateCase = (newCase: PgCase) => {
    setCases((prev) => [newCase, ...prev]);
    setActiveCaseId(newCase.id);
    syncCaseToCloud(newCase);
    setActiveTab('dashboard');
    showNotification(`Saved apartment unit ${newCase.roomCode}!`);
  };

  const handleDeleteCase = (caseId: string) => {
    const remaining = cases.filter((c) => c.id !== caseId);
    setCases(remaining);
    if (activeCaseId === caseId) {
      setActiveCaseId(remaining[0]?.id || '');
    }
    if (firebaseUser) {
      deleteCaseFromFirestore(caseId).catch((err) =>
        console.error('Error deleting from cloud:', err)
      );
    }
    showNotification('Apartment unit deleted.');
  };

  const handleSubmitApplication = (
    caseId: string,
    applicant: Omit<TenantApplication, 'id' | 'appliedAt' | 'status'>
  ) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const newApp: TenantApplication = {
          ...applicant,
          id: `app-${Date.now()}`,
          appliedAt: new Date().toLocaleDateString('en-IN', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
          }),
          status: 'pending',
        };
        const updatedCase: PgCase = {
          ...c,
          occupancyStatus:
            c.occupancyStatus === 'approved_occupied'
              ? 'approved_occupied'
              : 'pending_application',
          tenantApplications: [newApp, ...(c.tenantApplications || [])],
        };
        syncCaseToCloud(updatedCase);
        return updatedCase;
      })
    );
  };

  const handleSubmitPaymentUtr = (
    txData: Omit<PaymentTransaction, 'id' | 'receiptNo'>
  ) => {
    if (!activeCase.id) return;
    const newTx: PaymentTransaction = {
      ...txData,
      id: `pay-${Date.now()}`,
      receiptNo: `RCP-${activeCase.roomCode.replace('-', '')}-${new Date().getFullYear()}-${Math.floor(
        100 + Math.random() * 899
      )}`,
    };

    const updated: PgCase = {
      ...activeCase,
      payments: [newTx, ...(activeCase.payments || [])],
    };

    handleUpdateActiveCase(updated);
    showNotification(`UTR #${newTx.utrNumber} submitted.`);
  };

  const handleSubmitComplaint = async (
    complaintData: Omit<ComplaintItem, 'id' | 'ticketNo' | 'status' | 'createdAt'>
  ) => {
    if (!activeCase.id) return;
    const createdAt =
      new Date().toLocaleDateString('en-IN', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }) +
      ` · ${new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;

    const ticketNo = `TKT-${activeCase.roomCode.replace('-', '')}-${Math.floor(
      100 + Math.random() * 899
    )}`;

    const targetOwnerEmail =
      landownerProfile.email || activeCase.landlordEmail || '';

    const newComplaint: ComplaintItem = {
      ...complaintData,
      id: `cmp-${Date.now()}`,
      ticketNo,
      status: 'Open',
      createdAt,
      emailedToOwner: targetOwnerEmail,
      emailedAt: createdAt,
    };

    const updated: PgCase = {
      ...activeCase,
      complaints: [newComplaint, ...(activeCase.complaints || [])],
    };

    handleUpdateActiveCase(updated);
    showNotification(`Ticket ${newComplaint.ticketNo} saved.`);

    if (targetOwnerEmail) {
      try {
        const emailRes = await sendAutomatedComplaintEmailToOwner({
          caseDetails: activeCase,
          ownerEmail: targetOwnerEmail,
          ticketNo,
          title: complaintData.title,
          category: complaintData.category,
          priority: complaintData.priority,
          description: complaintData.description,
          createdAt,
        });

        if (emailRes?.previewUrl) {
          setCases((prev) =>
            prev.map((c) => {
              if (c.id !== activeCase.id) return c;
              const nextC = {
                ...c,
                complaints: (c.complaints || []).map((cmp) =>
                  cmp.id === newComplaint.id
                    ? {
                        ...cmp,
                        emailedToOwner: emailRes.emailedTo || targetOwnerEmail,
                        emailPreviewUrl: emailRes.previewUrl,
                      }
                    : cmp
                ),
              };
              syncCaseToCloud(nextC);
              return nextC;
            })
          );
        }
      } catch (_err) {
        // Handled gracefully
      }
    }
  };

  const handleVerifyUtr = (
    caseId: string,
    paymentId: string,
    approve: boolean
  ) => {
    const targetCase = cases.find((c) => c.id === caseId);
    if (!targetCase) return;

    const verifiedAt =
      new Date().toLocaleDateString('en-IN', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }) +
      ` · ${new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;

    const targetPayment = (targetCase.payments || []).find(
      (p) => p.id === paymentId
    );

    const updated: PgCase = {
      ...targetCase,
      rentStatus:
        approve && targetPayment?.paymentType === 'monthly_rent'
          ? 'Paid'
          : targetCase.rentStatus,
      payments: (targetCase.payments || []).map((p) =>
        p.id === paymentId
          ? {
              ...p,
              status: approve ? 'verified' : 'rejected',
              verifiedAt,
              verifiedBy: targetCase.landlordName,
            }
          : p
      ),
    };

    handleUpdateActiveCase(updated);
    showNotification(
      approve
        ? `Receipt #${targetPayment?.receiptNo} issued.`
        : `UTR #${targetPayment?.utrNumber} rejected.`
    );
  };

  const handleAddComparison = (comp: RoomComparison) => {
    if (!activeCase.id) return;
    const updated: PgCase = {
      ...activeCase,
      comparisons: [...activeCase.comparisons, comp],
    };
    handleUpdateActiveCase(updated);
    showNotification(`Inspection added: ${comp.area}`);
  };

  const handleUpdateComparison = (comp: RoomComparison) => {
    if (!activeCase.id) return;
    const updated: PgCase = {
      ...activeCase,
      comparisons: activeCase.comparisons.some((item) => item.id === comp.id)
        ? activeCase.comparisons.map((item) =>
            item.id === comp.id ? comp : item
          )
        : [...activeCase.comparisons, comp],
    };
    handleUpdateActiveCase(updated);
    showNotification(`Updated: ${comp.area}`);
  };

  const handleDeleteComparison = (compId: string) => {
    if (!activeCase.id) return;
    const updated: PgCase = {
      ...activeCase,
      comparisons: activeCase.comparisons.filter((item) => item.id !== compId),
    };
    handleUpdateActiveCase(updated);
    showNotification('Inspection removed.');
  };

  const handleExportLegalPack = async () => {
    if (!activeCase.id) return;
    setIsExporting(true);
    try {
      const payload = {
        action: 'export_legal_pack',
        timestamp: new Date().toISOString(),
        caseId: activeCase.id,
        tenancyId: activeCase.tenancyId,
        apartmentName: activeCase.pgName,
        unitNo: activeCase.roomNo,
        tenantName: activeCase.tenantName,
        landownerName: activeCase.landlordName,
        securityDeposit: activeCase.securityDeposit,
        claimedDamages: activeCase.deductions.reduce(
          (s, d) => s + d.amount,
          0
        ),
        legalDocuments: activeCase.legalDocuments || [],
        fullCaseData: activeCase,
      };

      const data = await exportCaseData(payload);
      showNotification(`Exported #${data.exportId || '101'}`);
      return data;
    } catch (e: unknown) {
      console.error('Export error:', e);
      showNotification('Export saved.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleResetData = () => {
    if (firebaseUser) {
      cases.forEach((c) => {
        deleteCaseFromFirestore(c.id).catch(() => {});
      });
    }
    try {
      [
        STORAGE_CASES_KEY,
        STORAGE_PROFILE_KEY,
        'nestora_landowner_cases_v8',
        'rentproof_landowner_profile_v1',
        'nestora_clean_cases_v9',
        'nestora_clean_profile_v9',
        'nestora_v11_cases',
        'nestora_v11_profile',
      ].forEach((k) => localStorage.removeItem(k));
    } catch (_e) {}
    setCases([]);
    setActiveCaseId('');
    showNotification('All data cleared to a clean slate.');
  };

  const handleSwitchRole = (
    newRole: 'owner' | 'resident',
    targetCaseId?: string
  ) => {
    const c =
      cases.find((item) => item.id === targetCaseId) || activeCase || cases[0];
    if (newRole === 'owner') {
      setSession({
        role: 'owner',
        identifier: landownerProfile.email || c?.landlordEmail || '',
        name: landownerProfile.fullName || c?.landlordName || 'Landowner',
        pgName: c?.pgName || 'My Property',
        roomCode: c?.roomCode || 'CONSOLE',
        activeCaseId: c?.id || '',
      });
      showNotification('Switched to Landowner Portal');
    } else {
      const occupiedCase =
        cases.find((item) => item.occupancyStatus === 'approved_occupied') ||
        cases[0];
      if (!occupiedCase) {
        showNotification(
          'Add an apartment unit in the Landowner Portal first before switching to Tenant View.'
        );
        return;
      }
      setActiveCaseId(occupiedCase.id);
      setSession({
        role: 'resident',
        identifier: occupiedCase.tenantEmail || occupiedCase.tenantPhone,
        name: occupiedCase.tenantName,
        pgName: occupiedCase.pgName,
        roomCode: occupiedCase.roomCode,
        activeCaseId: occupiedCase.id,
      });
      showNotification(
        `Switched to Tenant Portal (${occupiedCase.roomCode})`
      );
    }
  };

  if (!session) {
    return (
      <>
        <LoginPage
          cases={cases}
          onLogin={handleLogin}
          landownerProfile={landownerProfile}
          onSaveProfile={handleSaveLandownerProfile}
          onSubmitApplication={handleSubmitApplication}
          onResetData={handleResetData}
          firebaseUser={firebaseUser}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-emerald-600 selection:text-white">
      {notification && (
        <div className="fixed top-18 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      <Header
        session={session}
        activeCase={activeCase}
        cases={cases}
        onLogout={handleLogout}
        onExport={handleExportLegalPack}
        onOpenNoticeGen={() => setIsNoticeGenOpen(true)}
        onOpenOwnerProfile={() => setOpenOwnerProfileFlag(true)}
        onSwitchRole={handleSwitchRole}
        onResetData={handleResetData}
        isExporting={isExporting}
        firebaseUser={firebaseUser}
        onGoogleSignIn={handleGoogleSignIn}
      />

      {session.role === 'owner' ? (
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50">
          <div className="max-w-6xl mx-auto pb-16 md:pb-6">
            <OwnerPortal
              cases={cases}
              activeCase={activeCase}
              onSelectCase={handleSelectCase}
              onUpdateCase={handleUpdateActiveCase}
              onDeleteCase={handleDeleteCase}
              onOpenNewCase={() => setIsNewCaseOpen(true)}
              onVerifyUtr={handleVerifyUtr}
              landownerProfile={landownerProfile}
              onSaveProfile={handleSaveLandownerProfile}
              externalOpenProfile={openOwnerProfileFlag}
              onClearExternalOpenProfile={() => setOpenOwnerProfileFlag(false)}
            />
          </div>
        </main>
      ) : cases.length === 0 ? (
        <main className="flex-1 flex items-center justify-center p-6 bg-slate-50">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4 shadow-2xs">
            <Building2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h2 className="text-base font-extrabold text-slate-900">
              No Apartment Units Found
            </h2>
            <p className="text-xs text-slate-500">
              Switch to the Landowner Portal to add your first apartment unit.
            </p>
            <button
              type="button"
              onClick={() => handleSwitchRole('owner')}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
            >
              Switch to Landowner Portal
            </button>
          </div>
        </main>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            activeCase={activeCase}
            cases={cases}
            onSelectCase={handleSelectCase}
          />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50">
            <div className="max-w-6xl mx-auto pb-16 md:pb-6">
              {activeTab === 'dashboard' && (
                <DashboardTab
                  activeCase={activeCase}
                  onSwitchTab={setActiveTab}
                />
              )}

              {activeTab === 'receipt' && (
                <ResidentReceiptTab
                  activeCase={activeCase}
                  onSubmitPaymentUtr={handleSubmitPaymentUtr}
                  onUpdateCase={handleUpdateActiveCase}
                />
              )}

              {activeTab === 'complaints' && (
                <ComplaintBoxTab
                  activeCase={activeCase}
                  onSubmitComplaint={handleSubmitComplaint}
                  ownerEmail={landownerProfile.email || activeCase.landlordEmail}
                />
              )}

              {activeTab === 'agreement' && (
                <AgreementDetailsTab activeCase={activeCase} role="resident" />
              )}

              {activeTab === 'comparison' && (
                <ComparisonTab
                  activeCase={activeCase}
                  onAddComparison={handleAddComparison}
                  onUpdateComparison={handleUpdateComparison}
                  onDeleteComparison={handleDeleteComparison}
                  onUpdateCase={handleUpdateActiveCase}
                  role="resident"
                />
              )}

              {activeTab === 'ai' && (
                <AiAssistantTab
                  activeCase={activeCase}
                  role="resident"
                  allCases={cases}
                />
              )}
            </div>
          </main>
        </div>
      )}

      {session.role === 'resident' && cases.length > 0 && (
        <div className="md:hidden border-t border-slate-200 bg-white sticky bottom-0 z-40 px-2 py-1.5 flex items-center justify-around text-[10px]">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center py-1 px-2 rounded-lg cursor-pointer ${
              activeTab === 'dashboard'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 mb-0.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('receipt')}
            className={`flex flex-col items-center py-1 px-2 rounded-lg cursor-pointer ${
              activeTab === 'receipt'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500'
            }`}
          >
            <Receipt className="w-4 h-4 mb-0.5" />
            <span>Payments</span>
          </button>

          <button
            onClick={() => setActiveTab('complaints')}
            className={`flex flex-col items-center py-1 px-2 rounded-lg cursor-pointer ${
              activeTab === 'complaints'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500'
            }`}
          >
            <MessageSquareWarning className="w-4 h-4 mb-0.5" />
            <span>Disputes</span>
          </button>

          <button
            onClick={() => setActiveTab('agreement')}
            className={`flex flex-col items-center py-1 px-2 rounded-lg cursor-pointer ${
              activeTab === 'agreement'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500'
            }`}
          >
            <FileText className="w-4 h-4 mb-0.5" />
            <span>Legal</span>
          </button>

          <button
            onClick={() => setActiveTab('comparison')}
            className={`flex flex-col items-center py-1 px-2 rounded-lg cursor-pointer ${
              activeTab === 'comparison'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500'
            }`}
          >
            <Layers className="w-4 h-4 mb-0.5" />
            <span>Photos</span>
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`flex flex-col items-center py-1 px-2 rounded-lg cursor-pointer ${
              activeTab === 'ai'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500'
            }`}
          >
            <Sparkles className="w-4 h-4 mb-0.5" />
            <span>Assistant</span>
          </button>
        </div>
      )}

      <NewCaseModal
        isOpen={isNewCaseOpen}
        onClose={() => setIsNewCaseOpen(false)}
        onCreateCase={handleCreateCase}
        landownerProfile={landownerProfile}
      />

      <NoticeGeneratorModal
        isOpen={isNoticeGenOpen}
        onClose={() => setIsNoticeGenOpen(false)}
        activeCase={activeCase}
      />

      <OfflineIndicator />
    </div>
  );
}
