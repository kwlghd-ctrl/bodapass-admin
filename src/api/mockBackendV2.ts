/**
 * mockBackendV2 — 신규 도메인 모델 라우트 등록
 *
 * Worker / Company / SiteCompany / Employment 기반의 새 API.
 * 모든 라우트는 /v2/ prefix 로 통일.
 */

import { calcGongsu, calculateDailyGongsu } from '../utils/gongsu';
import type { WorkRule } from './workRule.types';
import { lookupWorkRule } from '../mock/workRules';

/**
 * Phase O6 — 공수 계산 정책 도입.
 *
 *  레거시: calcGongsu(checkInIso, checkOutIso) — 8h 기준 하드코드.
 *  신규  : calculateDailyGongsu({ checkInAt, checkOutAt, source, manualGongsu,
 *           adjustmentApproved, workRule }) — WorkRule 기반 정책형.
 *
 * 본 mockBackendV2 의 출퇴근 처리에서 가능한 곳은 calculateDailyGongsu 로
 * 위임 (resolveGongsu 헬퍼). 사이트별 WorkRule 이 없으면 default 룰 사용.
 *
 * 기존 calcGongsu 호출 사이트는 깨지지 않도록 유지 (backward compat).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resolveGongsu(opts: {
  siteId?: string;
  companyId?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  source?: 'FACE' | 'MANUAL' | 'ECARD' | 'IMPORTED';
  manualGongsu?: number | null;
  adjustmentApproved?: boolean;
  importedGongsu?: number | null;
}): { workedMinutes: number; gongsu: number; basis: string; warning?: string } {
  const workRule: WorkRule = lookupWorkRule({ siteId: opts.siteId, companyId: opts.companyId });
  return calculateDailyGongsu({
    checkInAt: opts.checkInAt,
    checkOutAt: opts.checkOutAt,
    source: opts.source,
    manualGongsu: opts.manualGongsu,
    adjustmentApproved: opts.adjustmentApproved,
    importedGongsu: opts.importedGongsu,
    workRule,
  });
}
// (resolveGongsu 는 새로운 라우트 또는 신규 출퇴근 처리에서 사용 가능)

import { localDateStr, localYearMonth } from '../utils/dateLocal';
import type { CloseStage, CloseStatusEntry } from './closeStatus';
import { FORWARD_TRANSITIONS, REVERSE_TRANSITIONS } from './closeStatus';
import type { AuditLogEntry, ListAuditLogQuery, ListAuditLogResponse } from './auditLog.types';
import type {
  AttendanceMonth,
  AttendanceMonthRow,
  BulkCheckOutRequest,
  BulkCheckOutResponse,
  FaceCheckRequest,
  FaceCheckResponse,
  ManualCheckRequest,
  ManualCheckResponse,
  SetGongsuRequest,
  SetGongsuResponse,
  TodayAttendance,
} from './attendanceV2.types';
import type {
  CreateEmploymentRequest,
  Employment,
  EmploymentView,
  ListEmploymentsResponse,
  ListEmploymentViewsResponse,
  UpdateEmploymentRequest,
} from './employment.types';
import type {
  Worker,
  ListWorkersResponse,
  RegisterWorkerRequest,
  RegisterWorkerResponse,
  UpdateWorkerRequest,
  UpdateWorkerResponse,
} from './worker.types';
import type {
  SiteCompany,
  ListSiteCompaniesResponse,
  CreateSiteCompanyRequest,
} from './siteCompany.types';
import type {
  Company,
  ListCompaniesResponse,
  CreateCompanyRequest,
  UpdateCompanyRequest,
} from './company.types';
import type {
  AttendanceAdjustmentRequest,
  AdjustmentStatus,
  CreateAdjustmentRequest,
  ApproveAdjustmentRequest,
  RejectAdjustmentRequest,
  CancelAdjustmentRequest,
  ListAdjustmentsResponse,
} from './attendanceAdjustment.types';

const CLOSE_STATUS_KEY = 'bodapass_admin:close_status_v2';
const AUDIT_LOG_KEY = 'bodapass_admin:audit_log_v2';
const ADJUSTMENT_KEY = 'bodapass_admin:attendance_adjustments_v2';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Handler = (req: any) => Promise<{ status: number; data: any }>;
export type RouteFn = (method: Method, pattern: RegExp, fn: Handler) => void;

export function registerV2Routes(opts: {
  route: RouteFn;
  loadDb: () => any;
  saveDb: (db: any) => void;
  loadAttendanceBucket: (siteId: string, yearMonth: string) => any;
  saveAttendanceBucket: (bucket: any) => void;
  currentUserOf: (db: any) => any;
  deterministicRandom: (seed: string) => number;
}) {
  const {
    route, loadDb, saveDb,
    loadAttendanceBucket, saveAttendanceBucket,
    currentUserOf, deterministicRandom,
  } = opts;

  function workerFromMember(m: any): Worker {
    const faceReg = !!m.faceVerified;
    return {
      id: m.id,
      workerCode: m.workerCode ?? ('W-26-' + String(m.id).slice(-6)),
      name: m.name,
      phone: m.phone,
      idType: m.idType,
      idNumberMasked: m.idNumberMasked,
      bankName: m.bankName,
      accountMasked: m.accountMasked,
      faceVerified: faceReg,
      faceTemplateId: m.id + '-face',
      verification: {
        identityVerified: !!m.idNumberMasked,
        faceRegistered: faceReg,
        bankVerified: !!m.accountMasked,
        privacyAgreed: !!m.contractSigned || !!m.idNumberMasked,
        contractSigned: m.contractSigned,
      },
      trustTier: m.trustTier ?? 1,
      status: m.status,
      safetyEduCompleted: m.safetyEduCompleted,
      registeredAt: m.joinedAt ?? localDateStr(),
    };
  }

  function syntheticSiteCompanyId(siteId: string, companyId: string): string {
    return 'SC-' + siteId + '-' + companyId;
  }

  function employmentFromMember(m: any): Employment {
    const db = loadDb();
    const site = (db.sites ?? []).find((s: any) => s.id === m.siteId);
    const companyId = site?.ownerCompanyId ?? 'C-001';
    return {
      id: 'E-' + m.id,
      workerId: m.id,
      siteCompanyId: syntheticSiteCompanyId(m.siteId, companyId),
      foremanEmploymentId: m.foremanId ? 'E-' + m.foremanId : undefined,
      assignedToSiteManager: m.assignedToSiteManager,
      trade: m.role,
      dailyWage: m.dailyWage,
      paymentAccountType: 'OWN',
      startDate: m.joinedAt ?? localDateStr(),
      endDate: m.leftAt,
      status: m.status === 'ACTIVE' ? 'ACTIVE' : m.status === 'INACTIVE' ? 'TERMINATED' : 'PAUSED',
      identityTier: m.trustTier ?? 1,
      insurance: m.insurance,
      nontaxable: m.nontaxable,
      contractSigned: m.contractSigned,
      contractSignedAt: m.contractSignedAt,
      createdAt: m.joinedAt ?? localDateStr(),
    };
  }

  function employmentViewFromMember(m: any): EmploymentView {
    const emp = employmentFromMember(m);
    const w = workerFromMember(m);
    const db = loadDb();
    const site = (db.sites ?? []).find((s: any) => s.id === m.siteId);
    const company = (db.companies ?? []).find((c: any) => c.id === (site?.ownerCompanyId ?? 'C-001'));
    const foremanMember = m.foremanId ? (db.members ?? []).find((x: any) => x.id === m.foremanId) : null;
    return {
      ...emp,
      workerCode: w.workerCode,
      workerName: w.name,
      workerPhone: w.phone,
      workerIdNumberMasked: w.idNumberMasked,
      workerBankName: w.bankName,
      workerAccountMasked: w.accountMasked,
      workerFaceVerified: !!w.faceVerified,
      workerTrustTier: w.trustTier,
      siteId: m.siteId,
      siteName: site?.name ?? '',
      companyId: company?.id ?? 'C-001',
      companyCode: company?.companyCode ?? 'C-001',
      companyName: company?.name ?? '',
      foremanName: foremanMember?.name,
    };
  }

  function recordFromOld(rec: any, m: any): any {
    return {
      ...rec,
      employmentId: 'E-' + m.id,
      workerCode: m.workerCode ?? ('W-26-' + String(m.id).slice(-6)),
      workerName: m.name,
      trade: m.role,
      companyId: 'C-001',
    };
  }

  /* ─── audit log helpers ─── */

  function loadAuditLog(): AuditLogEntry[] {
    try {
      const raw = localStorage.getItem(AUDIT_LOG_KEY);
      return raw ? JSON.parse(raw) as AuditLogEntry[] : [];
    } catch { return []; }
  }
  function saveAuditLog(entries: AuditLogEntry[]) {
    try { localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(entries.slice(-5000))); } catch { /* ignore */ }
  }
  // TODO(실서비스): append-only DB + 해시 체인 으로 전환. localStorage 는 변조 가능.
  function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'performedAt'>): string {
    const id = 'AUD-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const full: AuditLogEntry = { ...entry, id, performedAt: new Date().toISOString() };
    const all = loadAuditLog();
    all.push(full);
    saveAuditLog(all);
    return id;
  }

  /* ─── close status helpers ─── */

  type CloseStatusDb = Record<string, CloseStatusEntry>;
  function statusKey(scope: 'DAY' | 'MONTH', siteId: string, dateOrYm: string): string {
    return scope + ':' + siteId + ':' + dateOrYm;
  }
  function loadCloseStatus(): CloseStatusDb {
    try {
      const raw = localStorage.getItem(CLOSE_STATUS_KEY);
      return raw ? JSON.parse(raw) as CloseStatusDb : {};
    } catch { return {}; }
  }
  function saveCloseStatus(db: CloseStatusDb) {
    try { localStorage.setItem(CLOSE_STATUS_KEY, JSON.stringify(db)); } catch { /* ignore */ }
  }
  function getCloseStage(scope: 'DAY' | 'MONTH', siteId: string, dateOrYm: string): CloseStage {
    const db = loadCloseStatus();
    return db[statusKey(scope, siteId, dateOrYm)]?.stage ?? 'OPEN';
  }
  function setCloseStage(
    scope: 'DAY' | 'MONTH', siteId: string, dateOrYm: string,
    stage: CloseStage, by: { id: string; name: string }, reason?: string,
  ): CloseStatusEntry {
    const db = loadCloseStatus();
    const k = statusKey(scope, siteId, dateOrYm);
    const cur: CloseStatusEntry = db[k] ?? {
      scope, siteId,
      ...(scope === 'DAY' ? { date: dateOrYm } : { yearMonth: dateOrYm }),
      stage: 'OPEN', history: [],
    };
    cur.stage = stage;
    cur.history.push({
      stage,
      enteredAt: new Date().toISOString(),
      enteredBy: by.id, enteredByName: by.name, reason,
    });
    db[k] = cur;
    saveCloseStatus(db);
    return cur;
  }

  /* ────────── /v2/workers ────────── */

  route('get', /^\/v2\/workers$/, async (req) => {
    const db = loadDb();
    const q = req.params ?? {};
    let list = (db.members ?? []).map(workerFromMember) as Worker[];
    if (q.status && q.status !== 'ALL') list = list.filter((w) => w.status === q.status);
    if (q.trustTier && q.trustTier !== 'ALL') list = list.filter((w) => w.trustTier === Number(q.trustTier));
    if (q.q) {
      const needle = String(q.q).toLowerCase();
      list = list.filter((w) =>
        w.name.toLowerCase().includes(needle) ||
        w.phone.includes(needle) ||
        w.workerCode.toLowerCase().includes(needle),
      );
    }
    const res: ListWorkersResponse = {
      workers: list,
      totalActive: list.filter((w) => w.status === 'ACTIVE').length,
    };
    return { status: 200, data: res };
  });

  route('get', /^\/v2\/workers\/([^/]+)$/, async (req) => {
    const db = loadDb();
    const m = (db.members ?? []).find((x: any) => x.id === req.pathParams[0]);
    if (!m) return { status: 404, data: { message: '워커를 찾을 수 없습니다.' } };
    return { status: 200, data: workerFromMember(m) };
  });

  route('get', /^\/v2\/workers\/([^/]+)\/sensitive$/, async (req) => {
    const db = loadDb();
    const m = (db.members ?? []).find((x: any) => x.id === req.pathParams[0]);
    if (!m) return { status: 404, data: { message: '워커를 찾을 수 없습니다.' } };
    return {
      status: 200,
      data: { workerId: m.id, idNumberRaw: m.idNumberRaw, accountNumberRaw: m.accountNumberRaw },
    };
  });

  route('post', /^\/v2\/workers$/, async (req) => {
    const body = req.data as RegisterWorkerRequest;
    if (!body?.name || !body?.phone || !body?.idNumber) {
      return { status: 400, data: { message: 'name/phone/idNumber 필수' } };
    }
    const db = loadDb();
    const newId = 'M-' + Date.now().toString(36);
    const workerCode = 'W-26-' + String(db.members?.length ?? 0).padStart(6, '0');
    const idMasked = body.idNumber.replace(/-(\d)\d{6}/, '-$1******');
    const accountMasked = body.accountNumber.replace(/\d(?=\d{4})/g, '*');
    const performer = currentUserOf(db);
    const member: any = {
      id: newId, name: body.name, phone: body.phone, role: '', siteId: '', dailyWage: 0,
      idType: body.idType, idNumberMasked: idMasked, idNumberRaw: body.idNumber,
      idAddress: body.idAddress, bankName: body.bankName,
      accountMasked, accountNumberRaw: body.accountNumber,
      registrationMode: 'IN_PERSON', status: 'ACTIVE',
      joinedAt: localDateStr(),
      faceVerified: !!body.faceImageId,
      workerCode, trustTier: body.desiredTrustTier ?? 1,
    };
    db.members = [...(db.members ?? []), member];
    saveDb(db);

    appendAuditLog({
      type: 'WORKER_REGISTER', targetType: 'WORKER', targetId: newId,
      context: { workerName: member.name },
      after: workerFromMember(member),
      reason: '신규 워커 등록',
      performedBy: performer?.id ?? 'system', performedByName: performer?.name ?? '시스템',
    });

    const res: RegisterWorkerResponse = { worker: workerFromMember(member), message: '워커가 등록되었습니다.' };
    return { status: 200, data: res };
  });

  route('patch', /^\/v2\/workers\/([^/]+)$/, async (req) => {
    const db = loadDb();
    const m = (db.members ?? []).find((x: any) => x.id === req.pathParams[0]);
    if (!m) return { status: 404, data: { message: '워커를 찾을 수 없습니다.' } };
    const body = req.data as UpdateWorkerRequest;
    const before = workerFromMember(m);
    if (body.name) m.name = body.name;
    if (body.phone) m.phone = body.phone;
    if (body.idType) m.idType = body.idType;
    if (body.idNumber) {
      m.idNumberRaw = body.idNumber;
      m.idNumberMasked = body.idNumber.replace(/-(\d)\d{6}/, '-$1******');
    }
    if (body.bankName) m.bankName = body.bankName;
    if (body.accountNumber) {
      m.accountNumberRaw = body.accountNumber;
      m.accountMasked = body.accountNumber.replace(/\d(?=\d{4})/g, '*');
    }
    if (body.status) m.status = body.status;
    if (typeof body.safetyEduCompleted === 'boolean') m.safetyEduCompleted = body.safetyEduCompleted;
    saveDb(db);

    const performer = currentUserOf(db);
    appendAuditLog({
      type: 'WORKER_UPDATE', targetType: 'WORKER', targetId: m.id,
      context: { workerName: m.name }, before, after: workerFromMember(m),
      reason: '워커 정보 수정',
      performedBy: performer?.id ?? 'system', performedByName: performer?.name ?? '시스템',
    });

    const res: UpdateWorkerResponse = { worker: workerFromMember(m), message: '수정되었습니다.' };
    return { status: 200, data: res };
  });

  route('post', /^\/v2\/workers\/([^/]+)\/face$/, async (req) => {
    const db = loadDb();
    const m = (db.members ?? []).find((x: any) => x.id === req.pathParams[0]);
    if (!m) return { status: 404, data: { message: '워커를 찾을 수 없습니다.' } };
    m.faceVerified = true;
    saveDb(db);
    return { status: 200, data: workerFromMember(m) };
  });

  /* ────────── /v2/employments ────────── */

  function filterMembers(req: any): any[] {
    const db = loadDb();
    const q = req.params ?? {};
    let members = (db.members ?? []) as any[];
    if (q.workerId) members = members.filter((m) => m.id === q.workerId);
    if (q.siteId) members = members.filter((m) => m.siteId === q.siteId);
    if (q.companyId) {
      const sites = (db.sites ?? []).filter((s: any) => s.ownerCompanyId === q.companyId);
      const siteIds = new Set(sites.map((s: any) => s.id));
      members = members.filter((m) => siteIds.has(m.siteId));
    }
    if (q.siteCompanyId) {
      const m = String(q.siteCompanyId).match(/^SC-(.+?)-(C-.+)$/);
      if (m) members = members.filter((x) => x.siteId === m[1]);
      else members = [];
    }
    if (q.status && q.status !== 'ALL') {
      members = members.filter((m) => {
        if (q.status === 'ACTIVE') return m.status === 'ACTIVE';
        if (q.status === 'TERMINATED') return m.status === 'INACTIVE';
        if (q.status === 'PAUSED') return false;
        return true;
      });
    }
    if (q.q) {
      const needle = String(q.q).toLowerCase();
      members = members.filter((m) =>
        m.name.toLowerCase().includes(needle) ||
        (m.workerCode ?? '').toLowerCase().includes(needle) ||
        (m.role ?? '').toLowerCase().includes(needle),
      );
    }
    return members;
  }

  route('get', /^\/v2\/employments$/, async (req) => {
    const employments = filterMembers(req).map(employmentFromMember);
    return { status: 200, data: { employments } as ListEmploymentsResponse };
  });

  route('get', /^\/v2\/employments\/views$/, async (req) => {
    const views = filterMembers(req).map(employmentViewFromMember);
    const res: ListEmploymentViewsResponse = { views, totalActive: views.filter((v) => v.status === 'ACTIVE').length };
    return { status: 200, data: res };
  });

  route('get', /^\/v2\/employments\/([^/]+)$/, async (req) => {
    const employmentId = req.pathParams[0];
    const db = loadDb();
    const m = (db.members ?? []).find((x: any) => 'E-' + x.id === employmentId);
    if (!m) return { status: 404, data: { message: '채용 관계를 찾을 수 없습니다.' } };
    return { status: 200, data: employmentViewFromMember(m) };
  });

  route('post', /^\/v2\/employments$/, async (req) => {
    const body = req.data as CreateEmploymentRequest;
    const db = loadDb();
    const w = (db.members ?? []).find((m: any) => m.id === body.workerId);
    if (!w) return { status: 404, data: { message: '워커를 찾을 수 없습니다.' } };
    const scMatch = String(body.siteCompanyId).match(/^SC-(.+?)-(C-.+)$/);
    if (!scMatch) return { status: 400, data: { message: '잘못된 siteCompanyId 형식' } };
    w.siteId = scMatch[1];
    w.role = body.trade;
    w.dailyWage = body.dailyWage;
    w.foremanId = body.foremanEmploymentId ? body.foremanEmploymentId.replace(/^E-/, '') : undefined;
    w.assignedToSiteManager = !!body.assignedToSiteManager;
    w.insurance = body.insurance;
    w.nontaxable = body.nontaxable;
    w.joinedAt = body.startDate;
    saveDb(db);

    const performer = currentUserOf(db);
    const emp = employmentFromMember(w);
    appendAuditLog({
      type: 'EMPLOYMENT_CREATE', targetType: 'EMPLOYMENT', targetId: emp.id,
      context: { workerName: w.name, siteId: w.siteId, employmentId: emp.id },
      after: emp, reason: '신규 채용 관계 생성',
      performedBy: performer?.id ?? 'system', performedByName: performer?.name ?? '시스템',
    });
    return { status: 200, data: emp };
  });

  route('patch', /^\/v2\/employments\/([^/]+)$/, async (req) => {
    const db = loadDb();
    const employmentId = req.pathParams[0];
    const m = (db.members ?? []).find((x: any) => 'E-' + x.id === employmentId);
    if (!m) return { status: 404, data: { message: '채용 관계를 찾을 수 없습니다.' } };
    const body = req.data as UpdateEmploymentRequest;
    const before = employmentFromMember(m);
    if (body.trade) m.role = body.trade;
    if (typeof body.dailyWage === 'number') m.dailyWage = body.dailyWage;
    if (body.foremanEmploymentId !== undefined) {
      m.foremanId = body.foremanEmploymentId ? body.foremanEmploymentId.replace(/^E-/, '') : undefined;
    }
    if (typeof body.assignedToSiteManager === 'boolean') m.assignedToSiteManager = body.assignedToSiteManager;
    if (body.endDate) m.leftAt = body.endDate;
    if (body.status) m.status = body.status === 'ACTIVE' ? 'ACTIVE' : body.status === 'TERMINATED' ? 'INACTIVE' : 'ACTIVE';
    if (body.insurance) m.insurance = body.insurance;
    if (body.nontaxable) m.nontaxable = body.nontaxable;
    saveDb(db);

    const performer = currentUserOf(db);
    const after = employmentFromMember(m);
    appendAuditLog({
      type: 'EMPLOYMENT_UPDATE', targetType: 'EMPLOYMENT', targetId: after.id,
      context: { workerName: m.name, siteId: m.siteId, employmentId: after.id },
      before, after, reason: '채용 관계 수정',
      performedBy: performer?.id ?? 'system', performedByName: performer?.name ?? '시스템',
    });
    return { status: 200, data: after };
  });

  route('post', /^\/v2\/employments\/([^/]+)\/terminate$/, async (req) => {
    const db = loadDb();
    const employmentId = req.pathParams[0];
    const m = (db.members ?? []).find((x: any) => 'E-' + x.id === employmentId);
    if (!m) return { status: 404, data: { message: '채용 관계를 찾을 수 없습니다.' } };
    const body = req.data as { endDate: string; reason: string };
    if (!body?.reason || body.reason.length < 5) {
      return { status: 400, data: { message: '사유는 5자 이상' } };
    }
    const before = employmentFromMember(m);
    m.leftAt = body.endDate;
    m.status = 'INACTIVE';
    saveDb(db);
    const performer = currentUserOf(db);
    const after = employmentFromMember(m);
    appendAuditLog({
      type: 'EMPLOYMENT_TERMINATE', targetType: 'EMPLOYMENT', targetId: after.id,
      context: { workerName: m.name, siteId: m.siteId, employmentId: after.id },
      before, after, reason: body.reason,
      performedBy: performer?.id ?? 'system', performedByName: performer?.name ?? '시스템',
    });
    return { status: 200, data: after };
  });

  /* ────────── /v2/companies ────────── */

  function companyFromDb(c: any): Company {
    return {
      id: c.id, companyCode: c.id,
      name: c.name, bizRegNo: c.bizRegNo ?? '000-00-00000',
      representative: c.representative ?? c.ceo ?? '',
      address: c.address, phone: c.phone, industry: c.industry,
      isHQ: c.id === 'C-001', createdAt: c.createdAt ?? '2024-01-01',
    };
  }

  route('get', /^\/v2\/companies$/, async () => {
    const db = loadDb();
    return { status: 200, data: { companies: (db.companies ?? []).map(companyFromDb) } as ListCompaniesResponse };
  });

  route('get', /^\/v2\/companies\/([^/]+)$/, async (req) => {
    const db = loadDb();
    const c = (db.companies ?? []).find((x: any) => x.id === req.pathParams[0]);
    if (!c) return { status: 404, data: { message: '회사를 찾을 수 없습니다.' } };
    return { status: 200, data: companyFromDb(c) };
  });

  route('post', /^\/v2\/companies$/, async (req) => {
    const body = req.data as CreateCompanyRequest;
    const db = loadDb();
    const newId = 'C-' + String((db.companies?.length ?? 0) + 1).padStart(3, '0');
    const company: any = {
      id: newId, name: body.name, bizRegNo: body.bizRegNo, representative: body.representative,
      address: body.address, phone: body.phone, industry: body.industry, createdAt: localDateStr(),
    };
    db.companies = [...(db.companies ?? []), company];
    saveDb(db);
    return { status: 200, data: companyFromDb(company) };
  });

  route('patch', /^\/v2\/companies\/([^/]+)$/, async (req) => {
    const db = loadDb();
    const c = (db.companies ?? []).find((x: any) => x.id === req.pathParams[0]);
    if (!c) return { status: 404, data: { message: '회사를 찾을 수 없습니다.' } };
    const body = req.data as UpdateCompanyRequest;
    if (body.name) c.name = body.name;
    if (body.bizRegNo) c.bizRegNo = body.bizRegNo;
    if (body.representative) c.representative = body.representative;
    if (body.address !== undefined) c.address = body.address;
    if (body.phone !== undefined) c.phone = body.phone;
    if (body.industry !== undefined) c.industry = body.industry;
    saveDb(db);
    return { status: 200, data: companyFromDb(c) };
  });

  /* ────────── /v2/site-companies ────────── */

  function siteCompanyFromSite(site: any): SiteCompany {
    const companyId = site.ownerCompanyId ?? 'C-001';
    return {
      id: syntheticSiteCompanyId(site.id, companyId),
      siteId: site.id, companyId, role: 'PRIME',
      startDate: site.startDate ?? '2024-01-01', endDate: site.endDate,
      status: site.status === 'COMPLETED' ? 'TERMINATED' : 'ACTIVE',
      contractAmount: site.contractAmount,
      laborManagerName: site.manager, laborManagerPhone: site.managerPhone,
      createdAt: site.startDate ?? '2024-01-01',
    };
  }

  route('get', /^\/v2\/site-companies$/, async (req) => {
    const db = loadDb();
    const q = req.params ?? {};
    let scs: SiteCompany[] = (db.sites ?? []).map(siteCompanyFromSite);
    if (q.siteId) scs = scs.filter((sc) => sc.siteId === q.siteId);
    if (q.companyId) scs = scs.filter((sc) => sc.companyId === q.companyId);
    if (q.status && q.status !== 'ALL') scs = scs.filter((sc) => sc.status === q.status);
    return { status: 200, data: { siteCompanies: scs } as ListSiteCompaniesResponse };
  });

  route('get', /^\/v2\/site-companies\/([^/]+)$/, async (req) => {
    const db = loadDb();
    const id = req.pathParams[0];
    const m = id.match(/^SC-(.+?)-(C-.+)$/);
    if (!m) return { status: 400, data: { message: '잘못된 siteCompanyId' } };
    const site = (db.sites ?? []).find((s: any) => s.id === m[1]);
    if (!site) return { status: 404, data: { message: '현장을 찾을 수 없습니다.' } };
    return { status: 200, data: siteCompanyFromSite(site) };
  });

  route('post', /^\/v2\/site-companies$/, async (req) => {
    const body = req.data as CreateSiteCompanyRequest;
    const db = loadDb();
    const site = (db.sites ?? []).find((s: any) => s.id === body.siteId);
    if (!site) return { status: 404, data: { message: '현장을 찾을 수 없습니다.' } };
    if (body.role === 'PRIME') site.ownerCompanyId = body.companyId;
    saveDb(db);
    return { status: 200, data: siteCompanyFromSite(site) };
  });

  route('post', /^\/v2\/site-companies\/([^/]+)\/terminate$/, async (req) => {
    const db = loadDb();
    const id = req.pathParams[0];
    const m = id.match(/^SC-(.+?)-(C-.+)$/);
    if (!m) return { status: 400, data: { message: '잘못된 siteCompanyId' } };
    const site = (db.sites ?? []).find((s: any) => s.id === m[1]);
    if (!site) return { status: 404, data: { message: '현장을 찾을 수 없습니다.' } };
    const body = req.data as { endDate: string; reason: string };
    if (!body?.reason || body.reason.length < 5) return { status: 400, data: { message: '사유 5자 이상' } };
    site.endDate = body.endDate;
    site.status = 'COMPLETED';
    saveDb(db);
    return { status: 200, data: siteCompanyFromSite(site) };
  });

  /* ────────── /v2/attendance ────────── */

  route('get', /^\/v2\/attendance\/month$/, async (req) => {
    const q = req.params ?? {};
    const siteId = String(q.siteId ?? '');
    const yearMonth = String(q.yearMonth ?? localYearMonth());
    if (!siteId) return { status: 400, data: { message: 'siteId가 필요합니다.' } };

    const db = loadDb();
    const members = (db.members ?? []).filter((m: any) => m.siteId === siteId);
    const bucket = loadAttendanceBucket(siteId, yearMonth);
    const [yStr, mStr] = yearMonth.split('-');
    const year = Number(yStr); const month = Number(mStr);
    const lastDay = new Date(year, month, 0).getDate();
    const dates: string[] = [];
    for (let d = 1; d <= lastDay; d++) {
      dates.push(year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
    }

    let totalGongsu = 0, totalPay = 0, faceCount = 0, manualCount = 0;
    let absentCount = 0, lateCount = 0, earlyCount = 0;
    const rows: AttendanceMonthRow[] = members.map((m: any): AttendanceMonthRow => {
      const daily: Record<string, any> = {};
      let mGongsu = 0, mDays = 0, mPay = 0;
      for (const d of dates) {
        const r = bucket.records[m.id + '|' + d];
        if (!r) continue;
        daily[d] = recordFromOld(r, m);
        if (r.status === 'ABSENT') { absentCount++; continue; }
        mGongsu += r.gongsu; mPay += r.payAmount;
        if (r.gongsu > 0) mDays++;
        if (r.checkInMethod === 'FACE') faceCount++;
        if (r.checkInMethod === 'MANUAL') manualCount++;
        if (r.status === 'LATE') lateCount++;
        if (r.status === 'EARLY') earlyCount++;
      }
      totalGongsu += mGongsu; totalPay += mPay;
      return {
        employmentId: 'E-' + m.id,
        workerCode: m.workerCode ?? ('W-26-' + String(m.id).slice(-6)),
        workerName: m.name, trade: m.role, dailyWage: m.dailyWage,
        daily, totalGongsu: mGongsu, totalDays: mDays, totalPay: mPay,
      };
    });

    const result: AttendanceMonth = {
      year, month, siteId,
      closeStage: getCloseStage('MONTH', siteId, yearMonth),
      dates, rows,
      summary: {
        totalEmployments: members.length,
        totalGongsu, totalPay, faceCount, manualCount, absentCount, lateCount, earlyCount,
      },
    };
    return { status: 200, data: result };
  });

  route('get', /^\/v2\/attendance\/today$/, async (req) => {
    const siteId = String(req.params?.siteId ?? '');
    if (!siteId) return { status: 400, data: { message: 'siteId가 필요합니다.' } };
    const now = new Date();
    const todayStr = localDateStr(now);
    const yearMonth = todayStr.slice(0, 7);
    const bucket = loadAttendanceBucket(siteId, yearMonth);
    const db = loadDb();
    const members = (db.members ?? []).filter((m: any) => m.siteId === siteId);

    let beforeCount = 0, workingCount = 0, doneCount = 0;
    const memberStatus = members.map((m: any) => {
      const r = bucket.records[m.id + '|' + todayStr] ?? null;
      let status: 'BEFORE' | 'WORKING' | 'DONE' = 'BEFORE';
      if (r?.checkInAt && r?.checkOutAt) status = 'DONE';
      else if (r?.checkInAt) status = 'WORKING';
      if (status === 'BEFORE') beforeCount++;
      else if (status === 'WORKING') workingCount++;
      else doneCount++;
      return {
        employmentId: 'E-' + m.id,
        workerCode: m.workerCode ?? ('W-26-' + String(m.id).slice(-6)),
        workerName: m.name, trade: m.role, status,
        record: r ? recordFromOld(r, m) : null,
      };
    });

    const res: TodayAttendance = {
      siteId, date: todayStr,
      closeStage: getCloseStage('DAY', siteId, todayStr),
      members: memberStatus,
      summary: { totalCount: members.length, beforeCount, workingCount, doneCount },
    };
    return { status: 200, data: res };
  });

  route('post', /^\/v2\/attendance\/face-checkin$/, async (req) => handleFaceCheck(req, 'CHECK_IN'));
  route('post', /^\/v2\/attendance\/face-checkout$/, async (req) => handleFaceCheck(req, 'CHECK_OUT'));

  function handleFaceCheck(req: any, kind: 'CHECK_IN' | 'CHECK_OUT'): { status: number; data: FaceCheckResponse } {
    const body = req.data as FaceCheckRequest;
    if (!body?.siteId || !body?.faceImageId) {
      return { status: 400, data: { status: 'REJECTED', reason: 'OTHER', detail: 'siteId+faceImageId 필수' } };
    }
    const db = loadDb();
    const site = (db.sites ?? []).find((s: any) => s.id === body.siteId);
    if (!site) return { status: 200, data: { status: 'REJECTED', reason: 'OTHER', detail: '현장 없음' } };

    const members = (db.members ?? []).filter((m: any) => m.siteId === body.siteId && m.status === 'ACTIVE');
    if (members.length === 0) return { status: 200, data: { status: 'REJECTED', reason: 'NOT_EMPLOYED' } };
    const idx = Math.floor(deterministicRandom('face:' + body.faceImageId) * members.length);
    const matched = members[idx];
    const matchScore = 0.85 + deterministicRandom('score:' + body.faceImageId) * 0.14;
    if (matchScore < 0.7) return { status: 200, data: { status: 'REJECTED', reason: 'NO_FACE_MATCH', detail: 'score=' + matchScore.toFixed(2) } };
    const liveScore = deterministicRandom('live:' + body.faceImageId);
    if (liveScore < 0.05) return { status: 200, data: { status: 'REJECTED', reason: 'LIVENESS_FAILED' } };

    let geofenceResult: 'INSIDE' | 'OUTSIDE' | 'NO_LOCATION' | 'LOW_ACCURACY' = 'NO_LOCATION';
    let distanceFromSiteM: number | undefined;
    if (body.location && site.geofence) {
      const acc = body.location.accuracy ?? 0;
      if (acc > (site.geofence.gpsTolerance ?? 50)) geofenceResult = 'LOW_ACCURACY';
      else {
        const meters = haversineMeters(site.geofence, body.location);
        distanceFromSiteM = Math.round(meters);
        const radius = site.geofence.radiusM ?? 100;
        geofenceResult = meters <= radius ? 'INSIDE' : 'OUTSIDE';
        if (geofenceResult === 'OUTSIDE') {
          return { status: 200, data: { status: 'REJECTED', reason: 'OUTSIDE_GEOFENCE', detail: distanceFromSiteM + 'm' } };
        }
      }
    }

    const todayStr = localDateStr(new Date());
    const yearMonth = todayStr.slice(0, 7);
    const bucket = loadAttendanceBucket(body.siteId, yearMonth);
    const key = matched.id + '|' + todayStr;
    const existing = bucket.records[key];

    if (kind === 'CHECK_IN' && existing?.checkInAt) {
      return { status: 200, data: { status: 'REJECTED', reason: 'DUPLICATE_CHECKIN' } };
    }
    if (kind === 'CHECK_OUT' && !existing?.checkInAt) {
      return { status: 200, data: { status: 'REJECTED', reason: 'OTHER', detail: '출근 기록 없음' } };
    }

    const nowISO = new Date().toISOString();
    if (kind === 'CHECK_IN') {
      bucket.records[key] = {
        id: 'R-' + matched.id + '-' + todayStr, date: todayStr,
        memberId: matched.id, memberName: matched.name, role: matched.role, siteId: body.siteId,
        checkInAt: nowISO, checkOutAt: null,
        checkInMethod: 'FACE', checkOutMethod: null,
        checkInScore: matchScore, checkOutScore: null,
        status: 'NORMAL', workedMinutes: 0, gongsu: 0,
        dailyWage: matched.dailyWage, payAmount: 0,
        geofenceResult, distanceFromSiteM,
      };
    } else {
      const rec = bucket.records[key];
      rec.checkOutAt = nowISO;
      rec.checkOutMethod = 'FACE';
      rec.checkOutScore = matchScore;
      // ★ V1/V2 공통: calcGongsu
      const { workedMinutes, gongsu } = calcGongsu(rec.checkInAt, rec.checkOutAt);
      rec.workedMinutes = workedMinutes;
      rec.gongsu = gongsu;
      rec.payAmount = Math.round(rec.dailyWage * gongsu);
    }
    saveAttendanceBucket(bucket);

    return { status: 200, data: { status: 'OK', record: recordFromOld(bucket.records[key], matched) } };
  }

  route('post', /^\/v2\/attendance\/manual-check$/, async (req) => {
    const body = req.data as ManualCheckRequest;
    if (!body?.reason || body.reason.length < 5) {
      return { status: 400, data: { message: '사유 5자 이상' } };
    }
    const memberId = body.employmentId.replace(/^E-/, '');
    const db = loadDb();
    const m = (db.members ?? []).find((x: any) => x.id === memberId);
    if (!m) return { status: 404, data: { message: '채용 관계 없음' } };

    const yearMonth = body.date.slice(0, 7);
    const bucket = loadAttendanceBucket(m.siteId, yearMonth);
    const key = m.id + '|' + body.date;
    const performer = currentUserOf(db);

    let before: any = bucket.records[key] ? { ...bucket.records[key] } : null;
    const rec = bucket.records[key] ?? {
      id: 'R-' + m.id + '-' + body.date, date: body.date,
      memberId: m.id, memberName: m.name, role: m.role, siteId: m.siteId,
      checkInAt: null, checkOutAt: null,
      checkInMethod: null, checkOutMethod: null,
      checkInScore: null, checkOutScore: null,
      status: 'NORMAL', workedMinutes: 0, gongsu: 0,
      dailyWage: m.dailyWage, payAmount: 0,
    };
    const atISO = body.at ?? new Date().toISOString();
    if (body.action === 'CHECK_IN') {
      rec.checkInAt = atISO;
      rec.checkInMethod = 'MANUAL';
      rec.checkInScore = null;
    } else {
      rec.checkOutAt = atISO;
      rec.checkOutMethod = 'MANUAL';
      rec.checkOutScore = null;
      if (rec.checkInAt) {
        // ★ 공통 calcGongsu
        const { workedMinutes, gongsu } = calcGongsu(rec.checkInAt, rec.checkOutAt);
        rec.workedMinutes = workedMinutes;
        rec.gongsu = gongsu;
        rec.payAmount = Math.round(rec.dailyWage * gongsu);
      }
    }
    rec.manualReason = body.reason;
    rec.manualEntryRole = performer?.role === 'OWNER' ? 'HQ' : performer?.role === 'MANAGER' ? 'SITE' : 'FOREMAN';
    rec.manualEntryByName = performer?.name ?? '시스템';
    bucket.records[key] = rec;
    saveAttendanceBucket(bucket);

    const auditId = appendAuditLog({
      type: body.action === 'CHECK_IN' ? 'MANUAL_CHECKIN' : 'MANUAL_CHECKOUT',
      targetType: 'ATTENDANCE', targetId: rec.id,
      context: { siteId: m.siteId, employmentId: 'E-' + m.id, workerName: m.name, date: body.date },
      before, after: rec, reason: body.reason,
      performedBy: performer?.id ?? 'system', performedByName: performer?.name ?? '시스템',
    });

    const res: ManualCheckResponse = { record: recordFromOld(rec, m), auditLogId: auditId };
    return { status: 200, data: res };
  });

  route('post', /^\/v2\/attendance\/set-gongsu$/, async (req) => {
    const body = req.data as SetGongsuRequest;
    if (!body?.reason || body.reason.length < 5) {
      return { status: 400, data: { message: '사유 5자 이상' } };
    }
    const match = body.attendanceId.match(/^R-(M-\d+)-(\d{4}-\d{2}-\d{2})$/);
    if (!match) return { status: 400, data: { message: '잘못된 attendanceId' } };
    const memberId = match[1];
    const date = match[2];

    const db = loadDb();
    const m = (db.members ?? []).find((x: any) => x.id === memberId);
    if (!m) return { status: 404, data: { message: '워커 없음' } };

    const yearMonth = date.slice(0, 7);
    const bucket = loadAttendanceBucket(m.siteId, yearMonth);
    const key = m.id + '|' + date;
    const rec = bucket.records[key];
    if (!rec) return { status: 404, data: { message: '출근 기록 없음' } };

    const before = { ...rec };
    const fromGongsu = rec.gongsu;
    const fromPay = rec.payAmount;
    rec.gongsu = body.toGongsu;
    rec.payAmount = body.toPay ?? Math.round(rec.dailyWage * body.toGongsu);
    rec.manualPayHistory = rec.manualPayHistory ?? [];
    rec.manualPayHistory.push({
      at: new Date().toISOString(),
      fromGongsu, fromPay, toGongsu: rec.gongsu, toPay: rec.payAmount,
      reason: body.reason, by: currentUserOf(db)?.name,
    });
    saveAttendanceBucket(bucket);

    const performer = currentUserOf(db);
    const auditId = appendAuditLog({
      type: 'GONGSU_CHANGE', targetType: 'ATTENDANCE', targetId: rec.id,
      context: { siteId: m.siteId, employmentId: 'E-' + m.id, workerName: m.name, date },
      before, after: rec, reason: body.reason,
      performedBy: performer?.id ?? 'system', performedByName: performer?.name ?? '시스템',
    });

    const res: SetGongsuResponse = { record: recordFromOld(rec, m), auditLogId: auditId };
    return { status: 200, data: res };
  });

  route('post', /^\/v2\/attendance\/bulk-check-out$/, async (req) => {
    const body = req.data as BulkCheckOutRequest;
    const db = loadDb();
    const bucket = loadAttendanceBucket(body.siteId, body.date.slice(0, 7));
    const performer = currentUserOf(db);
    const targetMembers: any[] = (db.members ?? []).filter((m: any) => m.siteId === body.siteId);
    const targetIds = body.employmentIds ? new Set(body.employmentIds.map((e) => e.replace(/^E-/, ''))) : null;

    const records: any[] = [];
    const nowISO = new Date().toISOString();
    for (const m of targetMembers) {
      if (targetIds && !targetIds.has(m.id)) continue;
      const key = m.id + '|' + body.date;
      const rec = bucket.records[key];
      if (!rec?.checkInAt || rec?.checkOutAt) continue;
      rec.checkOutAt = nowISO;
      rec.checkOutMethod = 'MANUAL';
      rec.manualReason = (rec.manualReason ?? '') + ' [bulk-check-out: ' + (body.reason ?? '18:00 일괄 퇴근') + ']';
      const { workedMinutes, gongsu } = calcGongsu(rec.checkInAt, rec.checkOutAt);
      rec.workedMinutes = workedMinutes;
      rec.gongsu = gongsu;
      rec.payAmount = Math.round(rec.dailyWage * gongsu);
      records.push(recordFromOld(rec, m));
    }
    saveAttendanceBucket(bucket);

    const auditId = appendAuditLog({
      type: 'MANUAL_CHECKOUT', targetType: 'ATTENDANCE',
      targetId: 'BULK-' + body.siteId + '-' + body.date,
      context: { siteId: body.siteId, date: body.date },
      after: { count: records.length },
      reason: body.reason ?? '일괄 퇴근 처리',
      performedBy: performer?.id ?? 'system', performedByName: performer?.name ?? '시스템',
    });

    const res: BulkCheckOutResponse = { count: records.length, records, auditLogId: auditId };
    return { status: 200, data: res };
  });

  /* ────────── /close-status ────────── */

  route('get', /^\/v2\/close-status$/, async (req) => {
    const q = req.params ?? {};
    const scope = (q.scope ?? 'MONTH') as 'DAY' | 'MONTH';
    const siteId = String(q.siteId ?? '');
    const dateOrYm = scope === 'DAY' ? String(q.date ?? localDateStr()) : String(q.yearMonth ?? localYearMonth());
    if (!siteId) return { status: 400, data: { message: 'siteId 필요' } };
    const db = loadCloseStatus();
    const k = statusKey(scope, siteId, dateOrYm);
    const entry: CloseStatusEntry = db[k] ?? {
      scope, siteId,
      ...(scope === 'DAY' ? { date: dateOrYm } : { yearMonth: dateOrYm }),
      stage: 'OPEN', history: [],
    };
    return { status: 200, data: entry };
  });

  route('post', /^\/v2\/close-status\/advance$/, async (req) => handleTransition(req, false));
  route('post', /^\/v2\/close-status\/reopen$/, async (req) => handleTransition(req, true));

  function handleTransition(req: any, reverse: boolean) {
    const body = req.data as any;
    const scope = body.scope as 'DAY' | 'MONTH';
    const siteId = body.siteId as string;
    const dateOrYm = scope === 'DAY' ? body.date : body.yearMonth;
    const toStage = body.toStage as CloseStage;
    const reason = body.reason as string | undefined;

    const fromStage = getCloseStage(scope, siteId, dateOrYm);
    const allowed = reverse ? REVERSE_TRANSITIONS[fromStage] : FORWARD_TRANSITIONS[fromStage];
    if (!allowed.includes(toStage)) {
      return { status: 400, data: { message: fromStage + ' → ' + toStage + ' 전이 허용 안됨 (' + (reverse ? '역방향' : '정방향') + ')' } };
    }
    if (reverse && (!reason || reason.length < 5)) {
      return { status: 400, data: { message: 'REOPEN 사유 5자 이상' } };
    }

    const db = loadDb();
    const performer = currentUserOf(db);
    const performerInfo = { id: performer?.id ?? 'system', name: performer?.name ?? '시스템' };
    const entry = setCloseStage(scope, siteId, dateOrYm, toStage, performerInfo, reason);
    const auditId = appendAuditLog({
      type: reverse ? 'STAGE_REOPEN' : 'STAGE_FORWARD',
      targetType: scope === 'DAY' ? 'CLOSE_STATUS_DAY' : 'CLOSE_STATUS_MONTH',
      targetId: statusKey(scope, siteId, dateOrYm),
      context: { siteId, ...(scope === 'DAY' ? { date: dateOrYm } : { yearMonth: dateOrYm }) },
      before: { stage: fromStage }, after: { stage: toStage },
      reason: reason ?? (reverse ? '' : '정방향 전이'),
      performedBy: performerInfo.id, performedByName: performerInfo.name,
    });

    return {
      status: 200,
      data: {
        scope, siteId,
        ...(scope === 'DAY' ? { date: dateOrYm } : { yearMonth: dateOrYm }),
        fromStage, toStage,
        transitionedAt: entry.history[entry.history.length - 1].enteredAt,
        transitionedBy: performerInfo.name,
        auditLogId: auditId,
      },
    };
  }

  route('get', /^\/v2\/close-status\/bulk$/, async (req) => {
    const yearMonth = String(req.params?.yearMonth ?? localYearMonth());
    const db = loadDb();
    const result = (db.sites ?? []).map((s: any) => ({
      siteId: s.id, stage: getCloseStage('MONTH', s.id, yearMonth),
    }));
    return { status: 200, data: result };
  });

  /* ────────── /audit-log ────────── */

  route('get', /^\/v2\/audit-log$/, async (req) => {
    const q = (req.params ?? {}) as ListAuditLogQuery;
    let all = loadAuditLog();
    if (q.siteId) all = all.filter((e) => e.context?.siteId === q.siteId);
    if (q.employmentId) all = all.filter((e) => e.context?.employmentId === q.employmentId);
    if (q.yearMonth) all = all.filter((e) =>
      e.context?.yearMonth === q.yearMonth ||
      (e.context?.date ?? '').startsWith(q.yearMonth!),
    );
    if (q.types && q.types.length > 0) {
      const set = new Set(q.types);
      all = all.filter((e) => set.has(e.type));
    }
    if (q.targetTypes && q.targetTypes.length > 0) {
      const set = new Set(q.targetTypes);
      all = all.filter((e) => set.has(e.targetType));
    }
    if (q.from) all = all.filter((e) => e.performedAt >= q.from!);
    if (q.to) all = all.filter((e) => e.performedAt <= q.to!);
    all.sort((a, b) => (a.performedAt < b.performedAt ? 1 : -1));
    const limit = q.limit ?? 100;
    const sliced = all.slice(0, limit);
    const res: ListAuditLogResponse = {
      entries: sliced,
      nextCursor: all.length > limit ? String(limit) : undefined,
    };
    return { status: 200, data: res };
  });

  route('get', /^\/v2\/audit-log\/([^/]+)$/, async (req) => {
    const id = req.pathParams[0];
    const all = loadAuditLog();
    const found = all.find((e) => e.id === id);
    if (!found) return { status: 404, data: { message: '감사 로그 없음' } };
    return { status: 200, data: found };
  });

  /* ────────── /v2/attendance-adjustments — 출퇴근 보정 신청 ────────── */

  function loadAdjustments(): AttendanceAdjustmentRequest[] {
    try {
      const raw = localStorage.getItem(ADJUSTMENT_KEY);
      return raw ? JSON.parse(raw) as AttendanceAdjustmentRequest[] : [];
    } catch { return []; }
  }
  function saveAdjustments(list: AttendanceAdjustmentRequest[]) {
    try { localStorage.setItem(ADJUSTMENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }

  route('get', /^\/v2\/attendance-adjustments$/, async (req) => {
    const q = req.params ?? {};
    let all = loadAdjustments();
    if (q.employmentId) all = all.filter((r) => r.employmentId === q.employmentId);
    if (q.attendanceDate) all = all.filter((r) => r.attendanceDate === q.attendanceDate);
    if (q.status && q.status !== 'ALL') all = all.filter((r) => r.status === q.status);
    if (q.requestType) all = all.filter((r) => r.requestType === q.requestType);
    if (q.from) all = all.filter((r) => r.attendanceDate >= q.from);
    if (q.to) all = all.filter((r) => r.attendanceDate <= q.to);
    if (q.siteId) {
      const db = loadDb();
      const memberIds = new Set((db.members ?? []).filter((m: any) => m.siteId === q.siteId).map((m: any) => 'E-' + m.id));
      all = all.filter((r) => memberIds.has(r.employmentId));
    }
    all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const res: ListAdjustmentsResponse = {
      requests: all,
      pendingCount: all.filter((r) => r.status === 'REQUESTED').length,
    };
    return { status: 200, data: res };
  });

  route('get', /^\/v2\/attendance-adjustments\/([^/]+)$/, async (req) => {
    const id = req.pathParams[0];
    const found = loadAdjustments().find((r) => r.id === id);
    if (!found) return { status: 404, data: { message: '신청을 찾을 수 없습니다.' } };
    return { status: 200, data: found };
  });

  route('post', /^\/v2\/attendance-adjustments$/, async (req) => {
    const body = req.data as CreateAdjustmentRequest;
    if (!body?.employmentId || !body?.attendanceDate || !body?.requestType) {
      return { status: 400, data: { message: 'employmentId/attendanceDate/requestType 필수' } };
    }
    if (!body.reason || body.reason.length < 5) {
      return { status: 400, data: { message: '사유는 5자 이상' } };
    }
    const db = loadDb();
    const performer = currentUserOf(db);
    const now = new Date().toISOString();
    const newReq: AttendanceAdjustmentRequest = {
      id: 'ADJ-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      employmentId: body.employmentId,
      attendanceDate: body.attendanceDate,
      requestType: body.requestType,
      requestedBy: performer?.id ?? 'system',
      requestedByName: performer?.name ?? '시스템',
      reason: body.reason,
      requestedGongsu: body.requestedGongsu,
      requestedCheckOutAt: body.requestedCheckOutAt,
      status: 'REQUESTED',
      createdAt: now,
      updatedAt: now,
    };
    const all = loadAdjustments();
    all.push(newReq);
    saveAdjustments(all);
    return { status: 200, data: newReq };
  });

  route('post', /^\/v2\/attendance-adjustments\/([^/]+)\/approve$/, async (req) => {
    const id = req.pathParams[0];
    const all = loadAdjustments();
    const adj = all.find((r) => r.id === id);
    if (!adj) return { status: 404, data: { message: '신청을 찾을 수 없습니다.' } };
    if (adj.status !== 'REQUESTED') return { status: 400, data: { message: 'REQUESTED 상태만 승인 가능' } };

    const db = loadDb();
    const performer = currentUserOf(db);
    const memberId = adj.employmentId.replace(/^E-/, '');
    const m = (db.members ?? []).find((x: any) => x.id === memberId);
    if (m) {
      // 실 출퇴근 record 갱신
      const yearMonth = adj.attendanceDate.slice(0, 7);
      const bucket = loadAttendanceBucket(m.siteId, yearMonth);
      const key = m.id + '|' + adj.attendanceDate;
      const rec = bucket.records[key];
      if (rec) {
        const before = { ...rec };
        if (adj.requestedGongsu !== undefined) {
          rec.gongsu = adj.requestedGongsu;
          rec.payAmount = Math.round(rec.dailyWage * rec.gongsu);
        }
        if (adj.requestedCheckOutAt) {
          rec.checkOutAt = adj.requestedCheckOutAt;
        }
        saveAttendanceBucket(bucket);

        const auditId = appendAuditLog({
          type: adj.requestType === 'OVERTIME' ? 'GONGSU_CHANGE' : 'GONGSU_CHANGE',
          targetType: 'ATTENDANCE',
          targetId: rec.id,
          context: { siteId: m.siteId, employmentId: adj.employmentId, workerName: m.name, date: adj.attendanceDate },
          before, after: rec,
          reason: '신청 승인: ' + adj.reason + (req.data?.memo ? ' / ' + req.data.memo : ''),
          performedBy: performer?.id ?? 'system',
          performedByName: performer?.name ?? '시스템',
        });
        adj.auditLogId = auditId;
      }
    }

    adj.status = 'APPROVED';
    adj.approvedBy = performer?.id ?? 'system';
    adj.approvedByName = performer?.name ?? '시스템';
    adj.approvedAt = new Date().toISOString();
    adj.updatedAt = adj.approvedAt;
    saveAdjustments(all);
    return { status: 200, data: adj };
  });

  route('post', /^\/v2\/attendance-adjustments\/([^/]+)\/reject$/, async (req) => {
    const id = req.pathParams[0];
    const body = req.data as RejectAdjustmentRequest;
    if (!body?.rejectionReason || body.rejectionReason.length < 5) {
      return { status: 400, data: { message: '반려 사유는 5자 이상' } };
    }
    const all = loadAdjustments();
    const adj = all.find((r) => r.id === id);
    if (!adj) return { status: 404, data: { message: '신청을 찾을 수 없습니다.' } };
    if (adj.status !== 'REQUESTED') return { status: 400, data: { message: 'REQUESTED 상태만 반려 가능' } };

    const db = loadDb();
    const performer = currentUserOf(db);
    adj.status = 'REJECTED';
    adj.approvedBy = performer?.id ?? 'system';
    adj.approvedByName = performer?.name ?? '시스템';
    adj.approvedAt = new Date().toISOString();
    adj.rejectionReason = body.rejectionReason;
    adj.updatedAt = adj.approvedAt;
    saveAdjustments(all);

    const auditId = appendAuditLog({
      type: 'STAGE_REOPEN',
      targetType: 'ATTENDANCE',
      targetId: 'ADJ-' + id,
      context: { employmentId: adj.employmentId, date: adj.attendanceDate },
      before: { status: 'REQUESTED' }, after: { status: 'REJECTED' },
      reason: body.rejectionReason,
      performedBy: performer?.id ?? 'system',
      performedByName: performer?.name ?? '시스템',
    });
    adj.auditLogId = auditId;
    saveAdjustments(all);
    return { status: 200, data: adj };
  });

  route('post', /^\/v2\/attendance-adjustments\/([^/]+)\/cancel$/, async (req) => {
    const id = req.pathParams[0];
    const body = req.data as CancelAdjustmentRequest;
    const all = loadAdjustments();
    const adj = all.find((r) => r.id === id);
    if (!adj) return { status: 404, data: { message: '신청을 찾을 수 없습니다.' } };
    if (adj.status === 'APPROVED') return { status: 400, data: { message: '승인된 신청은 REOPEN 필요' } };
    adj.status = 'CANCELLED';
    adj.updatedAt = new Date().toISOString();
    if (body?.reason) adj.rejectionReason = body.reason;
    saveAdjustments(all);
    return { status: 200, data: adj };
  });

  /**
   * Phase Z2 — 민감정보 접근 감사로그 서버 저장.
   *
   * workerApi.getSensitive() 가 호출될 때 audit endpoint 가 자동으로 기록.
   * 실 백엔드 전환 시 그대로 동일 경로 호출.
   *
   * 저장 위치 — db.sensitiveAccessLogs (localStorage). 실서비스에선 별도 audit DB.
   *
   * 운영 권고:
   *  · rate-limit (시간당 N 건)
   *  · 권한 체크: OWNER + 노임대장 발행자만
   *  · 발급 ID 응답 → 화면에서 다운로드 ID 표시
   */
  route('post', /^\/v2\/audit\/sensitive-access$/, async (req) => {
    const db = loadDb();
    const body = (req.data ?? {}) as {
      workerId?: string;
      reason?: string;
      targetMonth?: string;
      siteId?: string;
    };
    if (!body.workerId || !body.reason) {
      return { status: 400, data: { message: 'workerId/reason 필수' } };
    }
    const me = currentUserOf(db);
    const entry = {
      id: 'AUD-SENS-' + Date.now().toString(36).toUpperCase(),
      type: 'SENSITIVE_ACCESS',
      workerId: body.workerId,
      reason: body.reason,
      targetMonth: body.targetMonth ?? null,
      siteId: body.siteId ?? null,
      accessedBy: me?.id ?? 'unknown',
      accessedByName: me?.name ?? 'unknown',
      at: new Date().toISOString(),
    };
    db.sensitiveAccessLogs = [...(db.sensitiveAccessLogs ?? []), entry];
    saveDb(db);
    return { status: 200, data: { ok: true, entryId: entry.id } };
  });

  /** Phase Z2 보조 — 감사로그 조회 (테스트/관리자용) */
  route('get', /^\/v2\/audit\/sensitive-access$/, async () => {
    const db = loadDb();
    return { status: 200, data: { items: db.sensitiveAccessLogs ?? [] } };
  });
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
