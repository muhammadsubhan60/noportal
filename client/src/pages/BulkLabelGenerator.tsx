import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import uspsLogo  from '../Logos/United_States_Postal_Service-Logo.wine.png';
import upsLogo   from '../Logos/United_Parcel_Service-Logo.wine.png';
import fedexLogo from '../Logos/FedEx_Express-Logo.wine.png';
import dhlLogo   from '../Logos/DHL-Logo.wine.png';
import {
  TruckIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon,
  ExclamationCircleIcon, DocumentTextIcon, XMarkIcon, ClockIcon,
  ClipboardDocumentListIcon, PlusIcon, TrashIcon,
  ArrowLeftIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import { getUspsZone1Rate } from '../utils/uspsRates';
import { lookupZip } from '../utils/zipLookup';

// ── Types ─────────────────────────────────────────────────────────────────────
interface SlSeriesOption { series: string; format: string; name: string; }
interface AccessItem {
  vendorId:        string;
  vendorName:      string;
  carrier:         string;
  vendorType:      'api' | 'manifest';
  shippingService: string;
  baseRate:        number;
  isAllowed:       boolean;
  rateTiers:       { minLbs: number; maxLbs: number | null; rate: number }[];
  portal:          'shippershub' | 'labelcrow' | 'shiplabel';
  shiplabelSeries?: SlSeriesOption[];
}

interface LcAsyncJob {
  type:       'labelcrow-async';
  lcJobId:    string;
  lcOrderId:  number;
  total:      number;
  bulkJobId:  string;
  newBalance: number;
}

interface LcJobProgress {
  status:      'queued' | 'processing' | 'completed' | 'failed';
  total:       number;
  generated:   number;
  failed:      number;
  progress:    number;
  orderId?:    string;
  zipUrl?:     string | null;
  newBalance?: number;
}

interface SlAsyncJob {
  type:       'shiplabel-async';
  bulkJobId:  string;
  total:      number;
  newBalance: number;
}

interface SlLabelResult {
  _id:             string;
  status:          'generated' | 'failed' | 'pending';
  trackingId:      string;
  pdfUrl:          string | null;
  shiplabelOrderId?: string;
  price:           number;
  from_name:       string;
  to_name:         string;
  to_zip:          string;
}

interface SlJobProgress {
  total:     number;
  generated: number;
  failed:    number;
  pending:   number;
  done:      boolean;
  labels:    SlLabelResult[];
}

interface LabelRow  { [key: string]: string; }

interface RowResult {
  success:    boolean;
  trackingId?: string;
  labelId?:   string;
  pdfUrl?:    string;
  cost?:      number;
  error?:     string;
}

interface ApiResult {
  type:       'api';
  bulkJobId:  string;
  results:    RowResult[];
  zipUrl:     string | null;
  newBalance: number;
}

interface ManifestResult {
  type:          'manifest';
  manifestJobId: string;
  status:        string;
  labelCount:    number;
  carrier:       string;
  vendorName:    string;
  totalCost:     number;
  newBalance:    number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const REQUIRED_COLS = [
  'from_name','from_address1','from_city','from_state','from_zip',
  'to_name','to_address1','to_city','to_state','to_zip','weight',
];

const ALL_COLS = [
  'from_name','from_company','from_phone','from_address1','from_address2','from_city','from_state','from_zip',
  'to_name','to_company','to_phone','to_address1','to_address2','to_city','to_state','to_zip',
  'weight','length','width','height','note',
];

const TABLE_COLS: { key: string; label: string; width: number; required: boolean }[] = [
  { key: 'from_name',     label: 'From Name',    width: 130, required: true  },
  { key: 'from_address1', label: 'From Addr',    width: 150, required: true  },
  { key: 'from_city',     label: 'F. City',      width: 100, required: true  },
  { key: 'from_state',    label: 'F.St',         width: 60,  required: true  },
  { key: 'from_zip',      label: 'F.Zip',        width: 80,  required: true  },
  { key: 'to_name',       label: 'To Name',      width: 130, required: true  },
  { key: 'to_address1',   label: 'To Addr',      width: 150, required: true  },
  { key: 'to_city',       label: 'T. City',      width: 100, required: true  },
  { key: 'to_state',      label: 'T.St',         width: 60,  required: true  },
  { key: 'to_zip',        label: 'T.Zip',        width: 80,  required: true  },
  { key: 'weight',        label: 'Wt (lbs)',     width: 80,  required: true  },
  { key: 'length',        label: 'Len',          width: 65,  required: false },
  { key: 'width',         label: 'Wid',          width: 65,  required: false },
  { key: 'height',        label: 'Hgt',          width: 65,  required: false },
  { key: 'note',          label: 'Note',         width: 120, required: false },
];

const CARRIERS = [
  { name: 'USPS',  accentColor: '#1D4ED8', selectedBg: '#EFF6FF', selectedBorder: '#1D4ED8', badgeClass: 'usps'  },
  { name: 'UPS',   accentColor: '#92400E', selectedBg: '#FFFBEB', selectedBorder: '#92400E', badgeClass: 'ups'   },
  { name: 'FedEx', accentColor: '#5B21B6', selectedBg: '#F5F3FF', selectedBorder: '#5B21B6', badgeClass: 'fedex' },
  { name: 'DHL',   accentColor: '#B45309', selectedBg: '#FEF3C7', selectedBorder: '#B45309', badgeClass: 'dhl'   },
];

const CARRIER_LOGOS: Record<string, string> = {
  USPS: uspsLogo, UPS: upsLogo, FedEx: fedexLogo, DHL: dhlLogo,
};

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const PORTALS = [
  { id: 'shippershub' as const, accentColor: '#1D4ED8', selectedBg: '#EFF6FF', selectedBorder: '#1D4ED8' },
  { id: 'labelcrow'   as const, accentColor: '#7C3AED', selectedBg: '#F5F3FF', selectedBorder: '#7C3AED' },
  { id: 'shiplabel'   as const, accentColor: '#059669', selectedBg: '#ECFDF5', selectedBorder: '#059669' },
];

// Placeholder shown only until /access/me resolves — never the raw portal brand,
// since a reseller's client should never see it flash before their white-label name loads.
const DEFAULT_PORTAL_LABELS: Record<string, string> = { shippershub: 'Standard', labelcrow: 'Express', shiplabel: 'Priority' };

// ── Helpers ───────────────────────────────────────────────────────────────────
const CarrierLogo = ({ name }: { name: string }) => {
  const src = CARRIER_LOGOS[name];
  if (!src) return null;
  return (
    <div style={{ width: 52, height: 28, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <img src={src} alt={name} style={{ width: 80, height: 48, objectFit: 'contain', display: 'block' }} />
    </div>
  );
};

const SAMPLE_ROWS: Record<string, string[][]> = {
  USPS:  [['John Doe','Acme Corp','555-1234','123 Main St','Suite 100','New York','NY','10001','Jane Smith','','','456 Oak Ave','','Los Angeles','CA','90001','16','12','10','8','Fragile']],
  UPS:   [['John Doe','','555-9876','789 Elm Rd','','Chicago','IL','60601','Bob Lee','','','321 Pine St','','Houston','TX','77001','20','','','','']],
  FedEx: [['Alice Brown','Corp LLC','','555 Maple Dr','','Seattle','WA','98101','Tom Green','','','99 River Rd','','Miami','FL','33101','10','','','','']],
  DHL:   [['Alice Brown','Corp LLC','','555 Maple Dr','','Seattle','WA','98101','Tom Green','','','99 River Rd','','Miami','FL','33101','10','','','','']],
};

function buildSampleCSV(carrier: string): string {
  const header = ALL_COLS.join(',');
  const rows   = (SAMPLE_ROWS[carrier] || SAMPLE_ROWS.USPS)
    .map(r => r.map(v => v.includes(',') ? `"${v}"` : v).join(','));
  return [header, ...rows].join('\n');
}

function downloadTemplate(carrier: string) {
  const csv  = buildSampleCSV(carrier);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${carrier}_bulk_template.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Label Crow XLSX format ────────────────────────────────────────────────────

// ── Label Crow XLSX column map ────────────────────────────────────────────────
const LC_XLSX_COL_MAP: Record<string, string> = {
  fromName:    'from_name',
  fromStreet:  'from_address1',
  fromStreet2: 'from_address2',
  fromCity:    'from_city',
  fromState:   'from_state',
  fromZip:     'from_zip',
  fromPhone:   'from_phone',
  toName:      'to_name',
  toStreet:    'to_address1',
  toStreet2:   'to_address2',
  toCity:      'to_city',
  toState:     'to_state',
  toZip:       'to_zip',
  toPhone:     'to_phone',
  weight:      'weight',
  length:      'length',
  width:       'width',
  height:      'height',
  orderNum:    'note',
};
const LC_XLSX_HEADERS = Object.keys(LC_XLSX_COL_MAP);

// ── ShipLabel XLSX column map ─────────────────────────────────────────────────
const SL_XLSX_COL_MAP: Record<string, string> = {
  No:             '__skip__',   // row number — ignored
  FromName:       'from_name',
  PhoneFrom:      'from_phone',
  Street1From:    'from_address1',
  CompanyFrom:    'from_company',
  Street2From:    'from_address2',
  CityFrom:       'from_city',
  StateFrom:      'from_state',
  PostalCodeFrom: 'from_zip',
  PostalCode:     'from_zip',   // some SL template versions omit "From" suffix
  ZipFrom:        'from_zip',
  Zip:            'from_zip',
  ToName:         'to_name',
  PhoneTo:        'to_phone',
  Street1To:      'to_address1',
  CompanyTo:      'to_company',
  Street2To:      'to_address2',
  CityTo:         'to_city',
  ZipTo:          'to_zip',
  PostalCodeTo:   'to_zip',
  StateTo:        'to_state',
  Weight:         'weight',
  length:         'length',
  width:          'width',
  height:         'height',
  description:    'note',
};
const SL_XLSX_HEADERS = Object.keys(SL_XLSX_COL_MAP).filter(h => h !== 'No');

// ── Shared: convert an Excel cell value to a clean string ─────────────────────
// Handles scientific-notation phone numbers (e.g. 1.48E+10 → "14800000000")
function xlsxCellToStr(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    // Round to avoid floating-point noise, then stringify
    return String(Math.round(val));
  }
  return String(val).trim();
}

// ── Shared XLSX parser ────────────────────────────────────────────────────────
function parseXLSXWithMap(
  buffer: ArrayBuffer,
  colMap: Record<string, string>,
): { headers: string[]; rows: LabelRow[]; rawHeaders: string[] } {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length < 2) return { headers: [], rows: [], rawHeaders: [] };

  // Normalized fallback: lowercase + no-spaces so "Postal Code" still matches "PostalCode"
  const normMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(colMap)) {
    normMap[k.toLowerCase().replace(/\s+/g, '')] = v;
  }
  const resolveCol = (h: string): string => {
    if (colMap[h] !== undefined) return colMap[h];
    const norm = h.toLowerCase().replace(/\s+/g, '');
    if (normMap[norm] !== undefined) return normMap[norm];
    return h.toLowerCase().replace(/\s+/g, '_');
  };

  const rawHeaders: string[] = data[0].map((h: any) => String(h).trim());
  const internalHeaders = rawHeaders
    .map(h => resolveCol(h))
    .filter(h => h !== '__skip__');

  const rows = data.slice(1)
    .filter(r => r.some((c: any) => xlsxCellToStr(c)))
    .map(r => {
      const obj: LabelRow = {};
      rawHeaders.forEach((h, i) => {
        const key = resolveCol(h);
        if (key === '__skip__') return;
        obj[key] = xlsxCellToStr(r[i]);
      });
      return obj;
    });

  return { headers: internalHeaders, rows, rawHeaders };
}

function downloadLcXlsxTemplate() {
  const sampleRow = [
    'John Doe', '123 Main St', 'Suite 100', 'New York', 'NY', '10001', '555-123-4567',
    'Jane Smith', '456 Oak Ave', '', 'Los Angeles', 'CA', '90001', '555-987-6543',
    '5', '12', '10', '8', 'ORD-001',
  ];
  const ws = XLSX.utils.aoa_to_sheet([LC_XLSX_HEADERS, sampleRow]);
  ws['!cols'] = LC_XLSX_HEADERS.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Labels');
  XLSX.writeFile(wb, 'labelcrow_bulk_template.xlsx');
}

function downloadSlXlsxTemplate() {
  const headers   = ['No', ...SL_XLSX_HEADERS];
  const sampleRow = [
    '1', 'John Doe', '5551234567', '123 Main St', 'Acme Corp', 'Suite 100',
    'New York', 'NY', '10001',
    'Jane Smith', '5559876543', '456 Oak Ave', '', '',
    'Los Angeles', '90001', 'CA',
    '5', '12', '10', '8', 'Sample shipment',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 5 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Labels');
  XLSX.writeFile(wb, 'shiplabel_bulk_template.xlsx');
}

// ── CSV format ────────────────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: LabelRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
  const rows    = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseRow(line);
    const obj: LabelRow = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

function validateRow(row: LabelRow): string[] {
  const errs: string[] = [];
  for (const col of REQUIRED_COLS) {
    if (!row[col]?.trim()) errs.push(`${col.replace(/_/g,' ')} required`);
  }
  if (row.weight && isNaN(parseFloat(row.weight))) errs.push('weight must be a number');

  for (const side of ['from', 'to'] as const) {
    const zip   = (row[`${side}_zip`] ?? '').trim();
    const state = (row[`${side}_state`] ?? '').trim().toUpperCase();
    const city  = (row[`${side}_city`] ?? '').trim();
    if (!/^\d{5}$/.test(zip)) continue;
    const hit = lookupZip(zip);
    const label = side === 'from' ? 'From' : 'To';
    if (!hit) { errs.push(`${label} ZIP ${zip} is not a valid US zip code`); continue; }
    if (state && hit.state !== state) {
      errs.push(`${label} ZIP ${zip} → state should be ${hit.state} (got ${state})`);
    }
    if (city && hit.city.toLowerCase() !== city.toLowerCase()) {
      errs.push(`${label} ZIP ${zip} → city suggestion: "${hit.city}" (entered: "${city}")`);
    }
  }

  return errs;
}

function emptyRow(): LabelRow {
  const row: LabelRow = {};
  ALL_COLS.forEach(c => { row[c] = ''; });
  return row;
}

/** Calculate effective rate for an AccessItem given a weight */
function getVendorEffectiveRate(vendor: AccessItem, weight: number): number {
  if (!vendor.rateTiers?.length) return vendor.baseRate;
  const tier = vendor.rateTiers.find(t =>
    weight >= t.minLbs && (t.maxLbs === null || weight <= t.maxLbs)
  );
  return tier?.rate ?? vendor.baseRate;
}

// ── Component ──────────────────────────────────────────────────────────────────
const BulkLabelGenerator: React.FC = () => {
  const navigate = useNavigate();

  // ── Existing state ──────────────────────────────────────────────────────────
  const [accessList,     setAccessList]     = useState<AccessItem[]>([]);
  const [portalLabels,   setPortalLabels]   = useState<Record<string, string>>(DEFAULT_PORTAL_LABELS);
  const [selectedCarrier,setSelectedCarrier]= useState('');
  const [selectedVendor, setSelectedVendor] = useState<AccessItem | null>(null);
  const [fileName,       setFileName]       = useState('');
  const [nickName,       setNickName]       = useState('');
  const [rows,           setRows]           = useState<LabelRow[]>([]);
  const [rowErrors,      setRowErrors]      = useState<Record<number, string[]>>({});
  const [headerMissing,  setHeaderMissing]  = useState<string[]>([]);
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [apiResult,      setApiResult]      = useState<ApiResult | null>(null);
  const [manifestResult, setManifestResult] = useState<ManifestResult | null>(null);
  const [genError,       setGenError]       = useState('');
  const [isDragging,     setIsDragging]     = useState(false);

  // ── Portal state ────────────────────────────────────────────
  const [selectedPortal,  setSelectedPortal]  = useState<'shippershub' | 'labelcrow' | 'shiplabel' | ''>('');
  const [selectedSeries,  setSelectedSeries]  = useState('');

  // ── Label Crow async state ───────────────────────────────────
  const [lcAsyncJob,    setLcAsyncJob]    = useState<LcAsyncJob | null>(null);
  const [lcJobProgress, setLcJobProgress] = useState<LcJobProgress | null>(null);

  // ── ShipLabel async state ────────────────────────────────────
  const [slAsyncJob,       setSlAsyncJob]       = useState<SlAsyncJob | null>(null);
  const [slJobProgress,    setSlJobProgress]    = useState<SlJobProgress | null>(null);

  const fileRef              = useRef<HTMLInputElement>(null);
  const lcPollRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const slPollRef            = useRef<ReturnType<typeof setInterval> | null>(null);

  const lcLog = useCallback((msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[LC-DEBUG] ${msg}`);
  }, []);

  const slLog = useCallback((msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[SL-DEBUG] ${msg}`);
  }, []);

  useEffect(() => {
    axios.get('/access/me')
      .then(r => {
        const list = r.data.access || [];
        console.log('[BulkAuto] accessList loaded:', list.length, 'items');
        console.log('[BulkAuto] USPS vendors:', list.filter((a: AccessItem) => a.carrier === 'USPS'));
        setAccessList(list);
        if (r.data.portalLabels) setPortalLabels(r.data.portalLabels);
      })
      .catch(e => console.error('[BulkAuto] /access/me failed:', e));
  }, []);

  const vendorsForCarrier = accessList.filter(a =>
    a.carrier === selectedCarrier &&
    a.isAllowed &&
    (a.portal || 'shippershub') === selectedPortal
  );

  const getEffectiveRate = useCallback((weight: number) => {
    if (!selectedVendor) return 0;
    return getVendorEffectiveRate(selectedVendor, weight);
  }, [selectedVendor]);

  const getRowRate = useCallback((_rowIdx: number, weight: number): number => {
    return getEffectiveRate(weight);
  }, [getEffectiveRate]);

  const allRowErrors = rowErrors;

  const totalCost = rows.reduce((sum, r, i) => sum + getRowRate(i, parseFloat(r.weight) || 0), 0);
  const hasErrors  = Object.keys(allRowErrors).length > 0 || headerMissing.length > 0;
  const carrier    = CARRIERS.find(c => c.name === selectedCarrier);

  const hasRateTiers  = !!selectedVendor?.rateTiers?.length;
  const validRowCount = rows.length - Object.keys(allRowErrors).length;

  // Savings vs retail — only in single-vendor USPS API mode
  const totalSavings = useMemo(() => {
    if (selectedCarrier !== 'USPS' || selectedVendor?.vendorType === 'manifest') return 0;
    return rows.reduce((sum, r) => {
      const w = parseFloat(r.weight) || 0;
      if (w <= 0) return sum;
      const retail = getUspsZone1Rate(w);
      if (retail === null) return sum;
      const saving = retail - getEffectiveRate(w);
      return sum + (saving > 0 ? saving : 0);
    }, 0);
  }, [rows, selectedCarrier, selectedVendor, getEffectiveRate]);

  // ── Row editing ──────────────────────────────────────────────────────────────
  const revalidateRows = useCallback((newRows: LabelRow[]) => {
    const errors: Record<number, string[]> = {};
    newRows.forEach((row, i) => {
      const e = validateRow(row);
      if (e.length) errors[i] = e;
    });
    setRowErrors(errors);
    return errors;
  }, []);

  const updateCell = (rowIdx: number, col: string, val: string) => {
    const newRows = rows.map((r, i) => i === rowIdx ? { ...r, [col]: val } : r);
    setRows(newRows);
    revalidateRows(newRows);
  };

  const deleteRow = (rowIdx: number) => {
    const newRows = rows.filter((_, i) => i !== rowIdx);
    setRows(newRows);
    revalidateRows(newRows);
  };

  const addRow = () => {
    const newRows = [...rows, emptyRow()];
    setRows(newRows);
    revalidateRows(newRows);
  };

  // ── File processing ──────────────────────────────────────────────────────────
  const clearFile = () => {
    setFileName(''); setRows([]); setRowErrors({}); setHeaderMissing([]);
  };

  const processFile = (file: File) => {
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
    const isCsv  = /\.csv$/i.test(file.name);

    const xlsxPortal = selectedPortal === 'labelcrow' || selectedPortal === 'shiplabel';
    if (xlsxPortal) {
      if (!isXlsx && !isCsv) { setHeaderMissing(['Please upload a .xlsx or .csv file']); return; }
    } else {
      if (!isCsv) { setHeaderMissing(['Please upload a .csv file']); return; }
    }

    setFileName(file.name);
    const reader = new FileReader();

    const handleParsed = (headers: string[], parsedRows: LabelRow[], src: string, rawHdrs?: string[]) => {
      const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
      if (selectedPortal === 'labelcrow') {
        console.group('[LC] File parsed');
        console.log('Source:', src, '| rows:', parsedRows.length);
        console.log('Headers (internal):', headers);
        if (missing.length) console.warn('Missing required cols:', missing);
        if (parsedRows[0]) console.log('Row 0 sample:', parsedRows[0]);
        console.groupEnd();
        lcLog(`File parsed — ${parsedRows.length} rows | format: ${src}${missing.length ? ` | MISSING: ${missing.join(', ')}` : ' | all required cols present'}`);
      } else if (selectedPortal === 'shiplabel') {
        console.group('[SL] File parsed');
        console.log('Source:', src, '| rows:', parsedRows.length);
        if (rawHdrs) console.log('Raw XLSX headers:', rawHdrs);
        console.log('Mapped internal headers:', headers);
        if (missing.length) console.warn('MISSING required cols:', missing);
        if (parsedRows[0]) console.log('Row 0 sample:', parsedRows[0]);
        console.groupEnd();
        slLog(`File: ${src} | ${parsedRows.length} rows`);
        if (rawHdrs) slLog(`Raw headers (${rawHdrs.length}): ${rawHdrs.join(' · ')}`);
        slLog(`Mapped headers (${headers.length}): ${headers.join(' · ')}`);
        if (missing.length) {
          slLog(`MISSING required cols: ${missing.join(', ')}`, 'error');
        } else {
          slLog('All required columns present ✓');
        }
        if (parsedRows[0]) slLog(`Row 0: ${JSON.stringify(parsedRows[0])}`);
      }
      setHeaderMissing(missing);
      if (missing.length === 0) {
        setRows(parsedRows);
        revalidateRows(parsedRows);
      } else {
        setRows([]);
      }
    };

    if (isXlsx && selectedPortal === 'labelcrow') {
      reader.onload = (e) => {
        const { headers, rows: parsedRows, rawHeaders } = parseXLSXWithMap(e.target?.result as ArrayBuffer, LC_XLSX_COL_MAP);
        handleParsed(headers, parsedRows, 'XLSX (LC camelCase)', rawHeaders);
      };
      reader.readAsArrayBuffer(file);
    } else if (isXlsx && selectedPortal === 'shiplabel') {
      reader.onload = (e) => {
        const { headers, rows: parsedRows, rawHeaders } = parseXLSXWithMap(e.target?.result as ArrayBuffer, SL_XLSX_COL_MAP);
        handleParsed(headers, parsedRows, 'XLSX (SL format)', rawHeaders);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        const { headers, rows: parsedRows } = parseCSV(e.target?.result as string);
        handleParsed(headers, parsedRows, 'CSV');
      };
      reader.readAsText(file);
    }
  };

  const handleFileDrop  = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  // ── Generate — normal single-vendor ─────────────────────────────────────────
  const handleGenerateNormal = async () => {
    if (!selectedVendor || hasErrors || rows.length === 0) return;
    setIsGenerating(true); setGenError('');

    const isLC = selectedPortal === 'labelcrow';
    if (isLC) {
      console.group('[LC] ── Bulk Submit ──');
      console.log('Vendor:', selectedVendor.vendorName, '| id:', selectedVendor.vendorId);
      console.log('Portal:', selectedPortal, '| carrier:', selectedVendor.carrier, '| service:', selectedVendor.shippingService);
      console.log('Label count:', rows.length);
      console.log('Row #1 (internal):', rows[0]);
      console.groupEnd();
      lcLog(`Submitting ${rows.length} labels → vendor: "${selectedVendor.vendorName}" (${selectedVendor.vendorId}) | ${selectedVendor.carrier} ${selectedVendor.shippingService}`);
    }

    try {
      const res = await axios.post('/labels/bulk', { vendorId: selectedVendor.vendorId, labels: rows, bulkFileName: nickName.trim() || fileName, ...(selectedSeries ? { shiplabel_series: selectedSeries } : {}) });

      if (isLC) {
        console.group('[LC] Submit response');
        console.log('HTTP status:', res.status);
        console.log('Response type:', res.data.type);
        console.log('Full response:', res.data);
        console.groupEnd();
        lcLog(`Response ${res.status} — type: ${res.data.type}`);
      }

      if (res.data.type === 'manifest') {
        setManifestResult(res.data as ManifestResult);
      } else if (res.data.type === 'labelcrow-async') {
        if (isLC) lcLog(`Job accepted — LC jobId: ${res.data.lcJobId} | orderId: ${res.data.lcOrderId} | total: ${res.data.total}`);
        setLcAsyncJob(res.data as LcAsyncJob);
        startLcPoll(res.data.lcJobId);
      } else if (res.data.type === 'shiplabel-async') {
        slLog(`Job accepted — bulkJobId: ${res.data.bulkJobId} | total: ${res.data.total}`);
        setSlAsyncJob(res.data as SlAsyncJob);
        startSlPoll(res.data.bulkJobId);
      } else {
        setApiResult(res.data as ApiResult);
      }
    } catch (err: any) {
      const data    = err.response?.data;
      const status  = err.response?.status;
      const errCode = data?.error?.code || data?.code || '';
      const errMsg  = data?.error?.message || data?.message || err.message || 'Failed to generate labels';

      if (isLC) {
        console.group('[LC] Submit ERROR');
        console.error('HTTP status:', status);
        console.error('Error code:', errCode || '(none)');
        console.error('Error message:', errMsg);
        console.error('Full response data:', data);
        console.error('Raw error:', err);
        console.groupEnd();
        lcLog(`ERROR ${status} ${errCode ? `[${errCode}]` : ''}: ${errMsg}`, 'error');
        if (data?.error) lcLog(`API error detail: ${JSON.stringify(data.error)}`, 'error');
      }
      if (selectedPortal === 'shiplabel') {
        slLog(`Submit ERROR ${status || ''}: ${errMsg}`, 'error');
        if (data?.message) slLog(`Server: ${data.message}`, 'error');
      }

      if (data?.errors?.length) setGenError(data.errors.map((e: any) => e.msg).join(' · '));
      else setGenError(errCode ? `[${errCode}] ${errMsg}` : errMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = () => handleGenerateNormal();

  // ── Available portals (only show portals where user has ≥1 allowed vendor) ──
  const availablePortals = useMemo(() =>
    PORTALS.filter(p => accessList.some(a => a.isAllowed && (a.portal || 'shippershub') === p.id)),
  [accessList]);

  // Stop polling on unmount
  useEffect(() => () => { stopLcPoll(); stopSlPoll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopLcPoll = () => {
    if (lcPollRef.current) { clearInterval(lcPollRef.current); lcPollRef.current = null; }
  };

  const startLcPoll = (jobId: string) => {
    stopLcPoll();
    let tick = 0;
    lcLog(`Poll started for job ${jobId} — interval: 2500ms`);
    lcPollRef.current = setInterval(async () => {
      tick++;
      try {
        const res = await axios.get(`/labels/labelcrow-job/${jobId}`);
        const d   = res.data;
        console.log(`[LC Poll #${tick}]`, { status: d.status, generated: d.generated, failed: d.failed, total: d.total, progress: d.progress });
        lcLog(`Poll #${tick} — status: ${d.status} | ${d.generated ?? '?'}/${d.total ?? '?'} done | ${d.failed ?? 0} failed | ${d.progress ?? 0}%`);
        setLcJobProgress(d);
        if (d.status === 'completed' || d.status === 'failed') {
          lcLog(`Job ${d.status.toUpperCase()} after ${tick} polls — generated: ${d.generated}, failed: ${d.failed}`, d.status === 'failed' ? 'error' : 'info');
          if (d.zipUrl) lcLog(`ZIP available at: ${d.zipUrl}`);
          stopLcPoll();
        }
      } catch (e: any) {
        const status = e.response?.status;
        const msg    = e.response?.data?.message || e.message || 'unknown';
        console.error(`[LC Poll #${tick}] ERROR`, e);
        lcLog(`Poll #${tick} ERROR — HTTP ${status ?? 'n/a'}: ${msg}`, 'error');
      }
    }, 2500);
  };

  const stopSlPoll = () => {
    if (slPollRef.current) { clearInterval(slPollRef.current); slPollRef.current = null; }
  };

  const startSlPoll = (bulkJobId: string) => {
    stopSlPoll();
    let tick = 0;
    slLog(`Poll started — jobId: ${bulkJobId}`);
    slPollRef.current = setInterval(async () => {
      tick++;
      try {
        const res = await axios.get(`/labels/shiplabel-job/${bulkJobId}`);
        const { total, generated, failed, pending, done } = res.data;
        slLog(`Tick ${tick}: ${generated}/${total} generated · ${failed} failed · ${pending} pending${done ? ' · DONE' : ''}`);
        if (failed > 0 && tick <= 3) slLog(`Some labels failed — check server logs for details`, 'warn');
        setSlJobProgress(res.data);
        if (done) { stopSlPoll(); slLog(`Job complete — ${generated} generated, ${failed} failed`, failed > 0 ? 'warn' : 'info'); }
      } catch (e: any) {
        slLog(`Poll tick ${tick} ERROR: ${e?.message || e}`, 'error');
        console.error('[SlPoll]', e);
      }
    }, 2000);
  };

  const reset = () => {
    stopLcPoll(); stopSlPoll();
    setSelectedPortal(''); setSelectedCarrier(''); setSelectedVendor(null); setSelectedSeries('');
    setFileName(''); setRows([]); setRowErrors({}); setHeaderMissing([]);
    setNickName('');
    setApiResult(null); setManifestResult(null);
    setLcAsyncJob(null); setLcJobProgress(null);
    setSlAsyncJob(null); setSlJobProgress(null);
    setGenError('');
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Manifest
  // ══════════════════════════════════════════════════════════════════════════════
  if (manifestResult) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Job Submitted</h1>
          <p className="page-subtitle">Your manifest job has been broadcast to available vendors.</p>
        </div>
      </div>
      <div className="sh-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', textAlign: 'center', borderTop: '4px solid var(--accent-500)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-50)', border: '2px solid var(--accent-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ClockIcon style={{ width: 32, height: 32, color: 'var(--accent-600)' }} />
        </div>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: 6 }}>Waiting for a vendor to accept</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>
            Your request has been sent to all {manifestResult.carrier} manifest vendors.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%', maxWidth: 480 }}>
          {[
            { val: manifestResult.labelCount, label: 'Labels', color: 'var(--navy-900)' },
            { val: `$${manifestResult.totalCost.toFixed(2)}`, label: 'Charged', color: 'var(--danger-600)' },
            { val: `$${manifestResult.newBalance.toFixed(2)}`, label: 'Balance', color: 'var(--accent-600)' },
          ].map(({ val, label, color }) => (
            <div key={label} style={{ padding: '0.875rem', background: 'var(--navy-50)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--navy-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--navy-50)', borderRadius: 8, padding: '0.75rem 1.25rem', display: 'flex', gap: 10, width: '100%', maxWidth: 480 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Job ID</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--navy-700)', wordBreak: 'break-all' }}>{manifestResult.manifestJobId}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="btn btn-ghost" onClick={reset}>Submit Another Batch</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Single API vendor
  // ══════════════════════════════════════════════════════════════════════════════
  if (apiResult) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Bulk Generation Complete</h1>
          <p className="page-subtitle">
            {apiResult.results.filter(r => r.success).length} succeeded · {apiResult.results.filter(r => !r.success).length} failed
          </p>
        </div>
      </div>
      {(() => {
        const successSavings = selectedCarrier === 'USPS' && selectedVendor?.vendorType !== 'manifest'
          ? apiResult.results.reduce((sum, r, i) => {
              if (!r.success) return sum;
              const w = parseFloat(rows[i]?.weight) || 0;
              const retail = getUspsZone1Rate(w);
              if (!retail) return sum;
              const saving = retail - getEffectiveRate(w);
              return sum + (saving > 0 ? saving : 0);
            }, 0)
          : 0;
        const cards = [
          { val: apiResult.results.filter(r => r.success).length,  label: 'Generated', color: 'var(--success-600)' },
          { val: apiResult.results.filter(r => !r.success).length, label: 'Failed',    color: apiResult.results.some(r => !r.success) ? 'var(--danger-600)' : 'var(--navy-500)' },
          { val: `$${apiResult.newBalance.toFixed(2)}`,            label: 'Remaining', color: 'var(--accent-600)' },
          ...(successSavings > 0 ? [{ val: `$${successSavings.toFixed(2)}`, label: 'Saved vs USPS', color: '#059669' }] : []),
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: '1rem' }}>
            {cards.map(({ val, label, color }) => (
              <div key={label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                {label === 'Saved vs USPS' && <SparklesIcon style={{ width: 18, height: 18, color: '#059669', margin: '0 auto 4px' }} />}
                <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{val}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        );
      })()}
      <div className="sh-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="sh-table">
            <thead><tr><th>#</th><th>To Name</th><th>Tracking ID</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {apiResult.results.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{rows[i]?.to_name || '—'}</td>
                  <td><span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.trackingId || '—'}</span></td>
                  <td>
                    {r.success
                      ? <span className="badge badge-green"><CheckCircleIcon style={{ width: 11, height: 11 }} />Generated</span>
                      : <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 11, height: 11 }} />{r.error || 'Failed'}</span>}
                  </td>
                  <td>
                    {r.pdfUrl && (
                      <button className="btn btn-ghost btn-sm" onClick={() => window.open(r.pdfUrl!, '_blank')}>
                        <ArrowDownTrayIcon style={{ width: 13, height: 13 }} /> PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={reset}>Generate Another Batch</button>
        {apiResult.zipUrl && (
          <button className="btn btn-primary" onClick={async () => {
            try {
              const res = await axios.get(apiResult.zipUrl!.replace(/^\//, ''), { responseType: 'blob' });
              const url = window.URL.createObjectURL(new Blob([res.data]));
              const a = document.createElement('a');
              a.href = url; a.download = (nickName.trim() || fileName).replace(/\.[^.]+$/, '') + '.zip';
              document.body.appendChild(a); a.click(); a.remove();
              window.URL.revokeObjectURL(url);
            } catch { alert('Failed to download ZIP.'); }
          }}>
            <ArrowDownTrayIcon style={{ width: 16, height: 16 }} /> Download All Labels (ZIP)
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => navigate('/labels/history')}>View History</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Label Crow async polling
  // ══════════════════════════════════════════════════════════════════════════════
  if (lcAsyncJob && (!lcJobProgress || lcJobProgress.status === 'queued' || lcJobProgress.status === 'processing')) {
    const prog = lcJobProgress;
    const pct  = prog ? Math.round((prog.generated / Math.max(prog.total, 1)) * 100) : 0;
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Generating Labels…</h1>
          <p className="page-subtitle">{portalLabels.labelcrow || DEFAULT_PORTAL_LABELS.labelcrow} is processing your batch. This usually takes 10–60 seconds.</p>
        </div>
        <div className="sh-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#7C3AED', marginBottom: 4 }}>
              {prog ? `${prog.generated} / ${prog.total}` : `0 / ${lcAsyncJob.total}`}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>labels generated</div>
          </div>
          <div style={{ height: 8, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden', maxWidth: 480, margin: '0 auto 16px' }}>
            <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#7C3AED,#6D28D9)', width: `${pct}%`, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#7C3AED', fontWeight: 600 }}>
            {prog?.status === 'processing' ? `Processing… ${pct}%` : 'Queued — starting shortly…'}
          </div>
          {(prog?.failed ?? 0) > 0 && (
            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--danger-600)' }}>
              {prog!.failed} failed so far
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — Label Crow complete / failed
  // ══════════════════════════════════════════════════════════════════════════════
  if (lcAsyncJob && lcJobProgress && (lcJobProgress.status === 'completed' || lcJobProgress.status === 'failed')) {
    const prog       = lcJobProgress;
    const allFailed  = prog.failed > 0 && prog.failed >= prog.total;
    const isRealFail = prog.status === 'failed' || allFailed;
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <div className="page-header" style={{ margin: 0 }}>
            <h1 className="page-title">
              {isRealFail ? `${portalLabels.labelcrow || DEFAULT_PORTAL_LABELS.labelcrow} Bulk Failed` : `${portalLabels.labelcrow || DEFAULT_PORTAL_LABELS.labelcrow} Bulk Complete`}
            </h1>
            <p className="page-subtitle">{prog.generated} generated · {prog.failed} failed</p>
          </div>
        </div>

        {/* All-failed diagnostic banner */}
        {allFailed && (
          <div style={{ background: '#FFF5F5', border: '1.5px solid #FECACA', borderRadius: 10, padding: '1rem 1.25rem', display: 'flex', gap: 12 }}>
            <ExclamationCircleIcon style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#DC2626', fontSize: '0.875rem', marginBottom: 4 }}>
                All {prog.total} labels failed PDF generation — tracking numbers were created but no PDFs produced
              </div>
              <div style={{ fontSize: '0.8rem', color: '#7F1D1D', lineHeight: 1.6 }}>
                Tracking numbers were created but labels could not be produced. Any credits charged for this batch will be automatically refunded.
              </div>
              <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#991B1B' }}>
                Please try a different vendor, or contact support if the issue continues.
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '1rem' }}>
          {[
            { val: prog.generated, label: 'Generated', color: isRealFail ? 'var(--navy-500)' : 'var(--success-600)' },
            { val: prog.failed,    label: 'Failed',    color: prog.failed > 0 ? 'var(--danger-600)' : 'var(--navy-500)' },
            { val: `$${(prog.newBalance ?? 0).toFixed(2)}`, label: 'Balance', color: 'var(--accent-600)' },
          ].map(({ val, label, color }) => (
            <div key={label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={reset}>Generate Another Batch</button>
          {!isRealFail && prog.zipUrl && (
            <button className="btn btn-primary" onClick={async () => {
              try {
                const r = await axios.get(prog.zipUrl!.replace(/^\//, ''), { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([r.data]));
                const a = document.createElement('a');
                a.href = url; a.download = (nickName.trim() || fileName).replace(/\.[^.]+$/, '') + '.zip';
                document.body.appendChild(a); a.click(); a.remove();
                window.URL.revokeObjectURL(url);
              } catch { alert('Download failed. Please try again.'); }
            }}>
              <ArrowDownTrayIcon style={{ width: 16, height: 16 }} /> Download All Labels (ZIP)
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => navigate('/labels/history')}>View History</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — ShipLabel live row-by-row progress
  // ══════════════════════════════════════════════════════════════════════════════
  if (slAsyncJob && slJobProgress && !slJobProgress.done) {
    const { total, generated, failed, pending } = slJobProgress;
    const pct = Math.round(((generated + failed) / Math.max(total, 1)) * 100);
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Generating Labels…</h1>
          <p className="page-subtitle">{portalLabels.shiplabel || DEFAULT_PORTAL_LABELS.shiplabel} is processing your batch — updating live.</p>
        </div>
        <div className="sh-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#059669', marginBottom: 4 }}>
              {generated + failed} / {total}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>labels processed</div>
          </div>
          <div style={{ height: 8, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden', maxWidth: 480, margin: '0 auto 12px' }}>
            <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#059669,#047857)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: '0.82rem', marginBottom: 8 }}>
            <span style={{ color: '#059669', fontWeight: 700 }}>{generated} generated</span>
            {failed > 0 && <span style={{ color: 'var(--danger-600)', fontWeight: 700 }}>{failed} failed</span>}
            <span style={{ color: 'var(--navy-500)' }}>{pending} pending</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>{pct}% complete…</div>
        </div>
        {slJobProgress.labels.filter(l => l.status !== 'pending').length > 0 && (
          <div className="sh-card">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Live Results
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="sh-table">
                <thead><tr><th>#</th><th>To Name</th><th>Tracking ID</th><th>Status</th></tr></thead>
                <tbody>
                  {slJobProgress.labels.filter(l => l.status !== 'pending').map((l, i) => (
                    <tr key={l._id}>
                      <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{l.to_name || '—'}</td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.trackingId || '—'}</span></td>
                      <td>
                        {l.status === 'generated'
                          ? <span className="badge badge-green"><CheckCircleIcon style={{ width: 11, height: 11 }} />Generated</span>
                          : <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 11, height: 11 }} />Failed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ShipLabel: show progress screen while waiting for first poll response
  if (slAsyncJob && !slJobProgress) {
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Generating Labels…</h1>
          <p className="page-subtitle">{portalLabels.shiplabel || DEFAULT_PORTAL_LABELS.shiplabel} is processing your batch — updating live.</p>
        </div>
        <div className="sh-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4, borderColor: '#059669', margin: '0 auto 16px' }} />
          <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>Starting… 0 / {slAsyncJob.total}</div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESULT — ShipLabel done
  // ══════════════════════════════════════════════════════════════════════════════
  if (slAsyncJob && slJobProgress && slJobProgress.done) {
    const { total, generated, failed, labels } = slJobProgress;
    return (
      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <div className="page-header" style={{ margin: 0 }}>
            <h1 className="page-title">{portalLabels.shiplabel || DEFAULT_PORTAL_LABELS.shiplabel} Bulk Complete</h1>
            <p className="page-subtitle">{generated} generated · {failed} failed</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '1rem' }}>
          {[
            { val: generated, label: 'Generated', color: 'var(--success-600)' },
            { val: failed,    label: 'Failed',    color: failed > 0 ? 'var(--danger-600)' : 'var(--navy-500)' },
            { val: total,     label: 'Total',     color: 'var(--navy-700)' },
            { val: `$${slAsyncJob.newBalance.toFixed(2)}`, label: 'Balance', color: 'var(--accent-600)' },
          ].map(({ val, label, color }) => (
            <div key={label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
        <div className="sh-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr><th>#</th><th>To Name</th><th>To ZIP</th><th>Tracking ID</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {labels.map((l, i) => (
                  <tr key={l._id}>
                    <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{l.to_name || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.to_zip || '—'}</td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.trackingId || '—'}</span></td>
                    <td>
                      {l.status === 'generated'
                        ? <span className="badge badge-green"><CheckCircleIcon style={{ width: 11, height: 11 }} />Generated</span>
                        : <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 11, height: 11 }} />Failed</span>}
                    </td>
                    <td>
                      {l.pdfUrl && (
                        <button className="btn btn-ghost btn-sm" onClick={() => window.open(l.pdfUrl!, '_blank')}>
                          <ArrowDownTrayIcon style={{ width: 13, height: 13 }} /> PDF
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {generated > 0 && (
            <button
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={async () => {
                try {
                  const r = await axios.get(`labels/zip/bulk/${slAsyncJob.bulkJobId}`, { responseType: 'blob' });
                  const blobUrl = window.URL.createObjectURL(new Blob([r.data], { type: 'application/zip' }));
                  const a = document.createElement('a');
                  a.href = blobUrl; a.download = 'shiplabel-labels.zip';
                  document.body.appendChild(a); a.click(); a.remove();
                  window.URL.revokeObjectURL(blobUrl);
                } catch { alert('Download failed. Please try again.'); }
              }}
            >
              <ArrowDownTrayIcon style={{ width: 15, height: 15 }} />
              Download ZIP ({generated} label{generated !== 1 ? 's' : ''})
            </button>
          )}
          <button className="btn btn-ghost" onClick={reset}>Generate Another Batch</button>
          <button className="btn btn-ghost" onClick={() => navigate('/labels/history')}>View History</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MAIN VIEW
  // ══════════════════════════════════════════════════════════════════════════════
  const currentStep = !selectedPortal ? 1 : !selectedCarrier ? 2 : !selectedVendor ? 3 : !fileName ? 4 : 5;
  const uploadEnabled = !!selectedVendor;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', paddingBottom: rows.length > 0 && uploadEnabled ? 80 : 0 }} className="animate-fadeIn">

      {/* ── Step wizard ──────────────────────────────────────── */}
      <div className="db-card" style={{ padding: '0.9rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {([
            { n: 1, label: 'Portal'   },
            { n: 2, label: 'Carrier'  },
            { n: 3, label: 'Vendor'   },
            { n: 4, label: 'Upload'   },
            { n: 5, label: 'Generate' },
          ] as const).map((s, i) => {
            const done = currentStep > s.n;
            const act  = currentStep === s.n;
            return (
              <React.Fragment key={s.n}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? '#10B981' : act ? '#6366F1' : 'var(--navy-100)',
                    border: `2px solid ${done ? '#10B981' : act ? '#6366F1' : 'var(--navy-200)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.25s ease',
                    boxShadow: act ? '0 0 0 4px rgba(99,102,241,0.12)' : 'none',
                  }}>
                    {done
                      ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <span style={{ fontSize: '0.65rem', fontWeight: 800, color: act ? '#fff' : 'var(--navy-400)', lineHeight: 1, fontFamily: FONT }}>{s.n}</span>}
                  </div>
                  <span style={{ fontSize: '0.58rem', fontWeight: done || act ? 700 : 500, color: done ? '#059669' : act ? '#6366F1' : 'var(--navy-400)', whiteSpace: 'nowrap', fontFamily: FONT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {s.label}
                  </span>
                </div>
                {i < 4 && (
                  <div style={{ flex: 1, height: 2, background: done ? '#10B981' : 'var(--navy-150, #E2E8F0)', margin: '0 8px', marginBottom: 18, transition: 'background 0.35s ease', borderRadius: 99 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Combined service card ─────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden' }}>

        {/* Row 0 — Portal pills */}
        {availablePortals.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 1rem', borderBottom: '1px solid var(--navy-100)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Portal</span>
            {availablePortals.map(p => {
              const isSel = selectedPortal === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (isSel) { setSelectedPortal(''); setSelectedCarrier(''); setSelectedVendor(null); setSelectedSeries(''); clearFile(); return; }
                    setSelectedPortal(p.id); setSelectedCarrier(''); setSelectedVendor(null); setSelectedSeries(''); clearFile();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 34, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
                    border: isSel ? `2px solid ${p.accentColor}` : '1.5px solid #e2e8f0',
                    background: isSel ? p.selectedBg : 'var(--bg-card)',
                    boxShadow: isSel ? `0 0 0 3px ${p.accentColor}18` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isSel ? p.accentColor : 'var(--navy-600)' }}>
                    {portalLabels[p.id] || DEFAULT_PORTAL_LABELS[p.id]}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Row 1 — Carrier pills + vendor dropdown + template */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', flexWrap: 'wrap', borderBottom: '1px solid var(--navy-100)' }}>

          {/* Carrier pills — filtered to selected portal */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {CARRIERS.map(c => {
              const allowed    = accessList.filter(a => a.carrier === c.name && a.isAllowed && (a.portal || 'shippershub') === selectedPortal);
              const isEnabled  = allowed.length > 0;
              const isSelected = selectedCarrier === c.name;
              return (
                <div
                  key={c.name}
                  onClick={() => {
                    if (!isEnabled) return;
                    if (isSelected) { setSelectedCarrier(''); setSelectedVendor(null); setSelectedSeries(''); clearFile(); return; }
                    setSelectedCarrier(c.name); setSelectedVendor(null); setSelectedSeries(''); clearFile();
                  }}
                  title={isEnabled ? `${c.name} · ${allowed.length} vendor${allowed.length !== 1 ? 's' : ''}` : 'No access'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 46, minWidth: 80, padding: '4px 12px', borderRadius: 10,
                    border: isSelected ? `2px solid ${c.accentColor}` : '1.5px solid #e2e8f0',
                    background: isSelected ? c.selectedBg : 'var(--bg-card)',
                    cursor: isEnabled ? 'pointer' : 'not-allowed',
                    opacity: isEnabled ? 1 : 0.35,
                    boxShadow: isSelected ? `0 0 0 3px ${c.accentColor}18, 0 2px 8px ${c.accentColor}20` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <CarrierLogo name={c.name} />
                </div>
              );
            })}
          </div>

          <div style={{ width: 1, height: 34, background: 'var(--navy-100)', flexShrink: 0 }} />

          {/* Vendor dropdown */}
          <div style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
            <select
              className="form-input form-select"
              value={selectedVendor?.vendorId || ''}
              disabled={!selectedPortal || !selectedCarrier}
              onChange={e => {
                const v = vendorsForCarrier.find(x => x.vendorId === e.target.value) || null;
                setSelectedVendor(v);
                setSelectedSeries('');
                clearFile();
              }}
              style={{ padding: '0.45rem 2rem 0.45rem 0.75rem', fontSize: '0.82rem', cursor: selectedCarrier ? 'pointer' : 'not-allowed' }}
            >
              <option value="">
                {!selectedPortal ? '← pick a portal first' : !selectedCarrier ? '← pick a carrier' : '— select vendor —'}
              </option>
              {vendorsForCarrier.map(v => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorName}{v.shippingService ? ` · ${v.shippingService}` : ''}
                </option>
              ))}
            </select>
            {selectedVendor?.shiplabelSeries && selectedVendor.shiplabelSeries.length > 0 && (
              <select
                value={selectedSeries}
                onChange={e => setSelectedSeries(e.target.value)}
                style={{ padding: '0.45rem 2rem 0.45rem 0.75rem', fontSize: '0.82rem', cursor: 'pointer', border: `1.5px solid ${selectedSeries ? '#059669' : '#f59e0b'}`, borderRadius: 8, background: '#fff', outline: 'none' }}
              >
                <option value="">— select series —</option>
                {selectedVendor.shiplabelSeries.map(opt => (
                  <option key={opt.series} value={opt.series}>
                    {opt.name ? `${opt.name} (${opt.series})` : opt.series}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Vendor badges */}
          {selectedVendor && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
              {selectedVendor.shippingService && <span className="badge badge-blue">{selectedVendor.shippingService}</span>}
              {selectedVendor.vendorType === 'manifest'
                ? <span className="badge badge-amber">Manifested</span>
                : <span className="badge badge-green">Auto</span>}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {selectedCarrier && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', flexShrink: 0 }}
              onClick={() =>
                selectedPortal === 'labelcrow' ? downloadLcXlsxTemplate()
                : selectedPortal === 'shiplabel' ? downloadSlXlsxTemplate()
                : downloadTemplate(selectedCarrier)
              }
            >
              <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
              {selectedPortal === 'labelcrow' || selectedPortal === 'shiplabel' ? 'Template (.xlsx)' : 'Template (.csv)'}
            </button>
          )}
        </div>

        {/* Row 2 — File upload */}
        <div style={{ padding: '0.625rem 1rem' }}>
          {fileName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <DocumentTextIcon style={{ width: 15, height: 15, color: 'var(--accent-500)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: 'var(--navy-800)', fontSize: '0.82rem' }}>{fileName}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>{rows.length} rows</span>
              {headerMissing.length === 0 && Object.keys(allRowErrors).length === 0 && rows.length > 0 && (
                <span className="badge badge-green"><CheckCircleIcon style={{ width: 10, height: 10 }} />Valid</span>
              )}
              {(headerMissing.length > 0 || Object.keys(allRowErrors).length > 0) && (
                <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />
                  {headerMissing.length > 0 ? 'Bad columns' : `${Object.keys(allRowErrors).length} row error${Object.keys(allRowErrors).length !== 1 ? 's' : ''}`}
                </span>
              )}
              {headerMissing.length > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger-600)' }}>
                  Missing: {headerMissing.join(', ')} —{' '}
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--accent-600)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
                    onClick={() =>
                      selectedPortal === 'labelcrow' ? downloadLcXlsxTemplate()
                      : selectedPortal === 'shiplabel' ? downloadSlXlsxTemplate()
                      : downloadTemplate(selectedCarrier)
                    }
                  >
                    get template
                  </button>
                </span>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', padding: '0.2rem 0.5rem' }} onClick={clearFile}>
                <XMarkIcon style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                border: isDragging ? '2px dashed var(--accent-400)' : '2px dashed var(--navy-200)',
                borderRadius: 9, padding: '0.55rem 0.875rem',
                background: isDragging ? 'var(--accent-50)' : 'var(--navy-50)',
                cursor: uploadEnabled ? 'pointer' : 'not-allowed',
                opacity: uploadEnabled ? 1 : 0.5,
                transition: 'all 0.15s',
              }}
              onDragOver={e => { if (!uploadEnabled) return; e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { if (!uploadEnabled) return; handleFileDrop(e); }}
              onClick={() => { if (!uploadEnabled) return; fileRef.current?.click(); }}
            >
              <ArrowUpTrayIcon style={{ width: 16, height: 16, color: isDragging ? 'var(--accent-500)' : 'var(--navy-500)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 500, color: isDragging ? 'var(--accent-700)' : 'var(--navy-600)' }}>
                {!uploadEnabled
                  ? !selectedPortal ? 'Select a portal above to get started'
                    : !selectedCarrier ? 'Select a carrier above'
                    : selectedPortal === 'labelcrow' ? 'Select a vendor above to upload XLSX'
                    : 'Select a vendor above to upload CSV'
                  : isDragging ? 'Drop it!'
                  : (selectedPortal === 'labelcrow' || selectedPortal === 'shiplabel') ? 'Drop .xlsx here or click to browse'
                  : 'Drop CSV here or click to browse'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginLeft: 4 }}>
                {(selectedPortal === 'labelcrow' || selectedPortal === 'shiplabel') ? '.xlsx / .csv' : '.csv only'}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept={(selectedPortal === 'labelcrow' || selectedPortal === 'shiplabel') ? '.xlsx,.xls,.csv' : '.csv'}
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Batch nickname ─────────────────────────────────────────── */}
      {fileName && rows.length > 0 && headerMissing.length === 0 && (
        <div className="db-card" style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Batch name</span>
          <input
            type="text"
            value={nickName}
            onChange={e => setNickName(e.target.value)}
            placeholder={fileName.replace(/\.[^.]+$/, '')}
            maxLength={200}
            style={{ flex: 1, border: '1.5px solid var(--navy-200)', borderRadius: 8, padding: '0.3rem 0.65rem', fontSize: '0.8rem', fontFamily: 'inherit', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none' }}
            onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' })}
            onBlur={e =>  Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' })}
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', whiteSpace: 'nowrap' }}>ZIP will be named: <strong>{(nickName.trim() || fileName).replace(/\.[^.]+$/, '')}.zip</strong></span>
        </div>
      )}

      {/* ── Data table ───────────────────────────────────────────── */}
      {rows.length > 0 && headerMissing.length === 0 && (
        <div className="db-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-600)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Review & Edit
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
            {Object.keys(allRowErrors).length > 0
              ? <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />{Object.keys(allRowErrors).length} error{Object.keys(allRowErrors).length !== 1 ? 's' : ''}</span>
              : <span className="badge badge-green"><CheckCircleIcon style={{ width: 10, height: 10 }} />All valid</span>}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={addRow}>
              <PlusIcon style={{ width: 13, height: 13 }} /> Add Row
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--navy-50)', borderBottom: '1px solid var(--navy-100)' }}>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', fontWeight: 700, color: 'var(--navy-600)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: 32 }}>#</th>
                  {TABLE_COLS.map(col => (
                    <th key={col.key} style={{ padding: '0.4rem 0.5rem', textAlign: 'left', fontWeight: 700, color: 'var(--navy-600)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', minWidth: col.width }}>
                      {col.label}{col.required && <span style={{ color: 'var(--danger-400)', marginLeft: 2 }}>*</span>}
                    </th>
                  ))}
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const errs        = allRowErrors[rowIdx] || [];
                  const hasRowError = errs.length > 0;
                  const zipErrCells = new Set<string>();
                  errs.forEach(e => {
                    if (e.startsWith('From ZIP') && e.includes('state should be')) zipErrCells.add('from_state');
                    if (e.startsWith('To ZIP')   && e.includes('state should be')) zipErrCells.add('to_state');
                    if (e.startsWith('From ZIP') && e.includes('city suggestion'))  zipErrCells.add('from_city');
                    if (e.startsWith('To ZIP')   && e.includes('city suggestion'))  zipErrCells.add('to_city');
                  });
                  return (
                    <React.Fragment key={rowIdx}>
                    <tr
                      style={{ borderBottom: '1px solid var(--navy-50)', background: hasRowError ? 'rgba(239,68,68,0.025)' : 'transparent' }}
                    >
                      <td style={{ padding: '0.25rem 0.5rem', color: 'var(--navy-500)', fontWeight: 600, fontSize: '0.75rem', verticalAlign: 'middle' }}>
                        {hasRowError
                          ? <ExclamationCircleIcon style={{ width: 13, height: 13, color: 'var(--danger-400)' }} title={errs.join(', ')} />
                          : rowIdx + 1}
                      </td>
                      {TABLE_COLS.map(col => {
                        const isEmpty     = col.required && !row[col.key]?.trim();
                        const isWeightErr = col.key === 'weight' && row[col.key] && isNaN(parseFloat(row[col.key]));
                        const cellError   = isEmpty || isWeightErr || zipErrCells.has(col.key);
                        return (
                          <td key={col.key} style={{ padding: '0.2rem 0.25rem', verticalAlign: 'middle' }}>
                            <input
                              value={row[col.key] || ''}
                              onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                              placeholder={col.key}
                              style={{
                                width: col.width, padding: '0.28rem 0.45rem',
                                border: cellError ? '1.5px solid var(--danger-400)' : '1.5px solid var(--navy-200)',
                                borderRadius: 6, fontSize: '0.8rem',
                                fontFamily: 'var(--font-sans)', color: 'var(--navy-900)',
                                background: cellError ? 'rgba(239,68,68,0.04)' : 'var(--bg-card)',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => { if (!cellError) e.target.style.borderColor = 'var(--accent-400)'; }}
                              onBlur={e => { e.target.style.borderColor = cellError ? 'var(--danger-400)' : 'var(--navy-200)'; }}
                            />
                          </td>
                        );
                      })}
                      <td style={{ padding: '0.2rem 0.4rem', verticalAlign: 'middle' }}>
                        <button
                          onClick={() => deleteRow(rowIdx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-300)', padding: 3, borderRadius: 5, display: 'flex', transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger-500)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--navy-300)')}
                        >
                          <TrashIcon style={{ width: 13, height: 13 }} />
                        </button>
                      </td>
                    </tr>
                    {hasRowError && (
                      <tr style={{ background: 'rgba(239,68,68,0.04)' }}>
                        <td />
                        <td colSpan={TABLE_COLS.length + 1} style={{ padding: '2px 6px 5px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {errs.map((e, ei) => (
                              <span key={ei} style={{ fontSize: '0.68rem', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 4, padding: '1px 7px', fontFamily: FONT }}>
                                {e}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--navy-50)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={addRow}>
              <PlusIcon style={{ width: 12, height: 12 }} /> Add Row
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>
              Click any cell to edit · red = required field missing
            </span>
          </div>
        </div>
      )}

      {/* ── Sticky footer ────────────────────────────────────────── */}
      {rows.length > 0 && uploadEnabled && headerMissing.length === 0 && (
        <div
          className="bulk-sticky-footer"
          style={{
            position: 'fixed', bottom: 0,
            left: 'var(--sidebar-w, 256px)', right: 0,
            background: 'var(--bg-card)', backdropFilter: 'blur(12px)',
            borderTop: '1px solid var(--navy-150, #e2e8f0)', boxShadow: '0 -8px 32px rgba(0,0,0,0.09)',
            padding: '0.75rem 1.5rem', zIndex: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {carrier && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: carrier.accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TruckIcon style={{ width: 12, height: 12, color: '#fff' }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy-900)' }}>{selectedCarrier}</span>
              </div>
            )}
            <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>

            <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}>{selectedVendor?.vendorName}</span>

            <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}>
                <strong style={{ color: 'var(--navy-900)' }}>{rows.length}</strong> label{rows.length !== 1 ? 's' : ''}
              </span>
              {!hasRateTiers && <>
                <span style={{ color: 'var(--navy-300)' }}>×</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}><strong>${selectedVendor?.baseRate.toFixed(2)}</strong>/ea</span>
              </>}
              <span style={{ color: 'var(--navy-300)' }}>=</span>
              <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--accent-600)' }}>${totalCost.toFixed(2)}</span>
            </div>

            {totalSavings > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', padding: '2px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                  <SparklesIcon style={{ width: 11, height: 11 }} /> Save ${totalSavings.toFixed(2)} vs USPS retail
                </span>
              </div>
            )}

            {validRowCount !== rows.length && (
              <span className="badge badge-amber"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />{Object.keys(allRowErrors).length} row error{Object.keys(allRowErrors).length !== 1 ? 's' : ''}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {genError && <span style={{ fontSize: '0.8rem', color: 'var(--danger-600)', maxWidth: 260 }}>{genError}</span>}
            <button
              className="btn btn-primary"
              disabled={hasErrors || isGenerating || rows.length === 0}
              onClick={handleGenerate}
              style={{ minWidth: 190, padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}
            >
              {isGenerating ? (
                <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Processing…</>
              ) : selectedVendor?.vendorType === 'manifest' ? (
                <><ClipboardDocumentListIcon style={{ width: 15, height: 15 }} />Submit Manifest Job</>
              ) : (
                <><TruckIcon style={{ width: 15, height: 15 }} />Generate {rows.length} Label{rows.length !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) { .bulk-sticky-footer { left: 0 !important; } }
      `}</style>
    </div>
  );
};

export default BulkLabelGenerator;
