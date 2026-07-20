import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  TruckIcon, ExclamationCircleIcon,
  ArrowDownTrayIcon, XMarkIcon, ArrowsRightLeftIcon,
  BuildingOfficeIcon, PlusIcon, TrashIcon, ChevronDownIcon,
  SparklesIcon, TagIcon, CubeIcon, UserIcon,
} from '@heroicons/react/24/outline';
import { getUspsZone1Rate } from '../utils/uspsRates';
import { lookupZip } from '../utils/zipLookup';
import uspsLogo  from '../Logos/United_States_Postal_Service-Logo.wine.png';
import upsLogo   from '../Logos/United_Parcel_Service-Logo.wine.png';
import fedexLogo from '../Logos/FedEx_Express-Logo.wine.png';
import dhlLogo   from '../Logos/DHL-Logo.wine.png';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN ?? '';

interface AddressSuggestion {
  display: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
}

interface SlSeriesOption { series: string; format: string; name: string; }
interface AccessItem {
  vendorId: string; vendorName: string; carrier: string;
  vendorType: 'api' | 'manifest'; shippingService: string;
  baseRate: number; isAllowed: boolean;
  portal?: 'shippershub' | 'labelcrow' | 'shiplabel';
  rateTiers: Array<{ minLbs: number; maxLbs: number | null; rate: number }>;
  shiplabelSeries?: SlSeriesOption[];
}
interface Warehouse {
  id: string; label: string;
  name: string; company: string; phone: string;
  address1: string; address2: string;
  city: string; state: string; zip: string;
}
interface Recipient {
  id: string; label: string;
  name: string; company: string; phone: string;
  address1: string; address2: string;
  city: string; state: string; zip: string;
}
interface DimPreset {
  id: string; label: string;
  length: string; width: string; height: string;
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;

const PORTALS = [
  { id: 'shippershub' as const, color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  { id: 'labelcrow'   as const, color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { id: 'shiplabel'   as const, color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
];

// Placeholder shown only until /access/me resolves — never the raw portal brand,
// since a reseller's client should never see it flash before their white-label name loads.
const DEFAULT_PORTAL_LABELS: Record<string, string> = { shippershub: 'Standard', labelcrow: 'Express', shiplabel: 'Priority' };

const CARRIER_CFG: Record<string, { solid: string; light: string; logo: string }> = {
  USPS:  { solid: '#1D4ED8', light: '#EFF6FF', logo: uspsLogo  },
  UPS:   { solid: '#92400E', light: '#FFFBEB', logo: upsLogo   },
  FedEx: { solid: '#6D28D9', light: '#F5F3FF', logo: fedexLogo },
  DHL:   { solid: '#B45309', light: '#FEF3C7', logo: dhlLogo   },
};

const COMMON_PACKAGES = [
  { label: 'USPS Sm FR',  length: '8.625',  width: '5.375',  height: '1.625' },
  { label: 'USPS Md FR',  length: '13.625', width: '11.875', height: '3.375' },
  { label: 'USPS Lg FR',  length: '12.25',  width: '12.25',  height: '6'     },
  { label: 'Shoe Box',    length: '13',      width: '8',      height: '6'     },
  { label: 'Sm Parcel',   length: '10',      width: '8',      height: '4'     },
  { label: 'Md Parcel',   length: '14',      width: '11',     height: '8'     },
  { label: 'Lg Parcel',   length: '18',      width: '14',     height: '12'    },
  { label: 'Poly Mailer', length: '12',      width: '10',     height: '1'     },
];

const BLANK_FORM = {
  from_name: '', from_company: '', from_phone: '',
  from_address1: '', from_address2: '', from_city: '', from_state: 'NY', from_zip: '', from_country: 'USA',
  to_name: '', to_company: '', to_phone: '',
  to_address1: '', to_address2: '', to_city: '', to_state: 'NJ', to_zip: '', to_country: 'USA',
  weight: '', length: '', width: '', height: '', note: '',
};

const WH_KEY  = 'shipme_warehouses';
const RCP_KEY = 'shipme_recipients';
const DIM_KEY = 'shipme_packages';

const loadWarehouses  = (): Warehouse[]  => { try { return JSON.parse(localStorage.getItem(WH_KEY)  || '[]'); } catch { return []; } };
const saveWarehouses  = (w: Warehouse[]) => localStorage.setItem(WH_KEY,  JSON.stringify(w));
const loadRecipients  = (): Recipient[]  => { try { return JSON.parse(localStorage.getItem(RCP_KEY) || '[]'); } catch { return []; } };
const saveRecipients  = (r: Recipient[]) => localStorage.setItem(RCP_KEY, JSON.stringify(r));
const loadDimPresets  = (): DimPreset[]  => { try { return JSON.parse(localStorage.getItem(DIM_KEY) || '[]'); } catch { return []; } };
const saveDimPresets  = (p: DimPreset[]) => localStorage.setItem(DIM_KEY, JSON.stringify(p));

const fieldLabel: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--navy-600)', letterSpacing: '0.03em',
  marginBottom: 5, fontFamily: FONT,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.6rem 0.75rem', fontSize: '0.84rem',
  border: '1.5px solid var(--navy-200)', borderRadius: 8,
  background: 'var(--bg-card)', color: 'var(--navy-900)',
  outline: 'none', transition: 'border-color 0.15s',
  fontFamily: FONT, lineHeight: 1.4, fontWeight: 400,
};

const F: React.FC<{
  label: string; name: string; value: string; required?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  type?: string; step?: string; min?: string; placeholder?: string;
  style?: React.CSSProperties;
}> = ({ label, name, value, required, onChange, type = 'text', step, min, placeholder, style }) => (
  <div style={style}>
    <div style={fieldLabel}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </div>
    <input
      name={name} type={type} step={step} min={min}
      required={required} value={value} onChange={onChange} placeholder={placeholder}
      style={inputStyle}
      onFocus={e => (e.target.style.borderColor = '#6366f1')}
      onBlur={e  => (e.target.style.borderColor = 'var(--navy-200)')}
    />
  </div>
);

const StateSelect: React.FC<{
  name: string; value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  style?: React.CSSProperties;
}> = ({ name, value, onChange, style }) => (
  <div style={style}>
    <div style={fieldLabel}>State<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></div>
    <select name={name} value={value} onChange={onChange} required
      style={{ ...inputStyle, cursor: 'pointer' }}>
      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
);

const Dot: React.FC<{ done: boolean }> = ({ done }) => (
  <div style={{
    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
    background: done ? '#22c55e' : 'var(--navy-200)',
    boxShadow: done ? '0 0 0 2.5px rgba(34,197,94,0.2)' : 'none',
    transition: 'background 0.25s, box-shadow 0.25s',
  }} />
);

// ── Shared dropdown panel (Warehouses / Recipients / Packages) ─────────────────
const PanelRow: React.FC<{
  icon: React.ReactNode; title: string; subtitle: string;
  onLoad: () => void; onDelete: () => void;
}> = ({ icon, title, subtitle, onLoad, onDelete }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--navy-50)', border: '1px solid var(--navy-150, #e2e8f0)', borderRadius: 7, padding: '0.45rem 0.6rem' }}>
    {icon}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>{title}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--navy-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>{subtitle}</div>
    </div>
    <button type="button" onClick={onLoad} style={{ background: '#6366F1', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: '0.65rem', fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0, fontFamily: FONT }}>Load</button>
    <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-300)', padding: 2, display: 'flex', alignItems: 'center' }}>
      <TrashIcon style={{ width: 12, height: 12 }} />
    </button>
  </div>
);


const LabelGenerator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill  = (location.state as any)?.prefill;

  const [accessList,        setAccessList]        = useState<AccessItem[]>([]);
  const [portalLabels,      setPortalLabels]      = useState<Record<string, string>>(DEFAULT_PORTAL_LABELS);
  const [selectedPortal,    setSelectedPortal]    = useState<'shippershub' | 'labelcrow' | 'shiplabel'>('shippershub');
  const [selectedCarrier,   setSelectedCarrier]   = useState<string>(prefill?.carrier ?? '');
  const [selectedVendorId,  setSelectedVendorId]  = useState('');
  const [selectedSeries,    setSelectedSeries]    = useState('');
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [isLoading,         setIsLoading]         = useState(false);
  const [error,             setError]             = useState('');
  const [isReturn,          setIsReturn]          = useState(!!prefill);
  const { vendorId: _pVid, carrier: _pCarrier, ...prefillFormFields } = (prefill || {}) as any;
  const [form,              setForm]              = useState({ ...BLANK_FORM, ...prefillFormFields });

  // Warehouses
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>(loadWarehouses);
  const [showWhPanel,  setShowWhPanel]  = useState(false);
  const [newWhLabel,   setNewWhLabel]   = useState('');
  const whBtnRef = useRef<HTMLDivElement>(null);

  // Recipients
  const [recipients,   setRecipients]   = useState<Recipient[]>(loadRecipients);
  const [showRcpPanel, setShowRcpPanel] = useState(false);
  const [newRcpLabel,  setNewRcpLabel]  = useState('');
  const rcpBtnRef = useRef<HTMLDivElement>(null);

  // Dim presets
  const [dimPresets,   setDimPresets]   = useState<DimPreset[]>(loadDimPresets);
  const [showDimPanel, setShowDimPanel] = useState(false);
  const [newDimLabel,  setNewDimLabel]  = useState('');
  const dimPanelRef = useRef<HTMLDivElement>(null);

  // Flash states (yellow highlight when a preset is loaded)
  const [flashFrom, setFlashFrom] = useState(false);
  const [flashTo,   setFlashTo]   = useState(false);
  const [flashDims, setFlashDims] = useState(false);

  // Pulse button when all 3 sections complete
  const [pulseKey,    setPulseKey]    = useState(0);
  const prevAllDone = useRef(false);

  // Address autocomplete
  const [fromSugg,     setFromSugg]     = useState<AddressSuggestion[]>([]);
  const [toSugg,       setToSugg]       = useState<AddressSuggestion[]>([]);
  const [showFromSugg, setShowFromSugg] = useState(false);
  const [showToSugg,   setShowToSugg]   = useState(false);
  const [suggError,    setSuggError]    = useState('');
  const fromSuggRef  = useRef<HTMLDivElement>(null);
  const toSuggRef    = useRef<HTMLDivElement>(null);
  const fromDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toDebounce   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    axios.get('/access/me').then(res => {
      const list = res.data.access || [];
      setAccessList(list);
      if (res.data.portalLabels) setPortalLabels(res.data.portalLabels);
      if (prefill?.vendorId) {
        const match = list.find((a: AccessItem) => a.vendorId === prefill.vendorId && a.isAllowed);
        if (match) setSelectedVendorId(match.vendorId);
      }
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Click-outside for each panel (ref on the button+dropdown wrapper only)
  useEffect(() => {
    if (!showWhPanel) return;
    const h = (e: MouseEvent) => { if (whBtnRef.current && !whBtnRef.current.contains(e.target as Node)) setShowWhPanel(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showWhPanel]);

  useEffect(() => {
    if (!showRcpPanel) return;
    const h = (e: MouseEvent) => { if (rcpBtnRef.current && !rcpBtnRef.current.contains(e.target as Node)) setShowRcpPanel(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showRcpPanel]);

  useEffect(() => {
    if (!showDimPanel) return;
    const h = (e: MouseEvent) => { if (dimPanelRef.current && !dimPanelRef.current.contains(e.target as Node)) setShowDimPanel(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showDimPanel]);

  useEffect(() => {
    if (!showFromSugg) return;
    const h = (e: MouseEvent) => { if (fromSuggRef.current && !fromSuggRef.current.contains(e.target as Node)) setShowFromSugg(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showFromSugg]);

  useEffect(() => {
    if (!showToSugg) return;
    const h = (e: MouseEvent) => { if (toSuggRef.current && !toSuggRef.current.contains(e.target as Node)) setShowToSugg(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showToSugg]);

  const searchAddress = async (query: string, side: 'from' | 'to') => {
    if (query.length < 3) {
      if (side === 'from') { setFromSugg([]); setShowFromSugg(false); }
      else                 { setToSugg([]);   setShowToSugg(false);   }
      return;
    }
    setSuggError('');
    if (!MAPBOX_TOKEN) { setSuggError('Mapbox token not configured'); return; }
    try {
      // Use fetch (not axios) to avoid the global axios 401 interceptor logging the user out
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=US&types=address&limit=5&access_token=${MAPBOX_TOKEN}`;
      const res  = await fetch(url);
      if (!res.ok) { setSuggError(`Address lookup error (${res.status})`); return; }
      const data = await res.json();
      const features = data?.features ?? [];
      const suggestions: AddressSuggestion[] = features.map((feat: any) => {
        const streetNum  = feat.address ?? '';
        const streetName = feat.text    ?? '';
        const address1   = streetNum ? `${streetNum} ${streetName}`.trim() : streetName;
        const ctx: any[] = feat.context ?? [];
        const zip        = ctx.find((c: any) => c.id?.startsWith('postcode'))?.text ?? '';
        const city       = ctx.find((c: any) => c.id?.startsWith('place'))?.text    ?? '';
        const regionCode = ctx.find((c: any) => c.id?.startsWith('region'))?.short_code ?? '';
        const state      = regionCode.replace('US-', '');
        return { display: feat.place_name ?? address1, address1, city, state, zip };
      });
      if (side === 'from') { setFromSugg(suggestions); setShowFromSugg(suggestions.length > 0); }
      else                 { setToSugg(suggestions);   setShowToSugg(suggestions.length > 0);   }
    } catch {
      setSuggError('Address lookup unavailable');
    }
  };

  const selectSuggestion = (sugg: AddressSuggestion, side: 'from' | 'to') => {
    setForm((f: typeof BLANK_FORM) => ({
      ...f,
      [`${side}_address1`]: sugg.address1,
      [`${side}_city`]:     sugg.city,
      [`${side}_state`]:    sugg.state || f[`${side}_state` as keyof typeof BLANK_FORM],
      [`${side}_zip`]:      sugg.zip,
    }));
    if (side === 'from') { setFromSugg([]); setShowFromSugg(false); }
    else                 { setToSugg([]);   setShowToSugg(false);   }
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>, side: 'from' | 'to') => {
    handleChange(e);
    const val = e.target.value;
    if (side === 'from') {
      clearTimeout(fromDebounce.current);
      fromDebounce.current = setTimeout(() => searchAddress(val, 'from'), 350);
    } else {
      clearTimeout(toDebounce.current);
      toDebounce.current = setTimeout(() => searchAddress(val, 'to'), 350);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((f: typeof BLANK_FORM) => ({ ...f, [name]: value }));
    setError('');

    // ZIP → city / state auto-fill from local database
    if ((name === 'from_zip' || name === 'to_zip') && value.length === 5) {
      const side = name === 'from_zip' ? 'from' : 'to';
      const hit  = lookupZip(value);
      if (hit) setForm((f: typeof BLANK_FORM) => ({ ...f, [`${side}_city`]: hit.city, [`${side}_state`]: hit.state }));
    }
  };

  const handlePortalSelect = (portal: typeof selectedPortal) => {
    setSelectedPortal(portal); setSelectedCarrier(''); setSelectedVendorId(''); setSelectedSeries('');
    setError('');
  };

  const handleCarrierSelect = (carrier: string) => {
    setSelectedCarrier(carrier); setSelectedVendorId(''); setSelectedSeries('');
    setError('');
  };

  const carrierVendors = accessList.filter(a =>
    a.carrier === selectedCarrier && a.isAllowed &&
    (a.portal || 'shippershub') === selectedPortal
  );

  const handleVendorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vid = e.target.value;
    if (!vid) { setSelectedVendorId(''); setSelectedSeries(''); return; }
    setSelectedSeries('');
    const item = accessList.find(a => a.vendorId === vid);
    if (item?.vendorType === 'manifest') { setShowManifestModal(true); return; }
    setSelectedVendorId(vid); setError('');
  };

  const selectedAccess = accessList.find(a => a.vendorId === selectedVendorId);
  const weight         = parseFloat(form.weight) || 0;

  const getEffectiveRate = (w: number): number => {
    if (!selectedAccess) return 0;
    if (!selectedAccess.rateTiers?.length) return selectedAccess.baseRate;
    const tier = selectedAccess.rateTiers.find(t => w >= t.minLbs && (t.maxLbs === null || w <= t.maxLbs));
    return tier?.rate ?? selectedAccess.baseRate;
  };

  const effectiveRate = getEffectiveRate(weight);
  const activeSeriesOptions = selectedAccess?.shiplabelSeries || [];
  const needsSeriesPick = activeSeriesOptions.length > 0;
  const canSubmit = !!selectedVendorId && !isLoading && (!needsSeriesPick || !!selectedSeries);

  const uspsSaving = useMemo(() => {
    if (selectedCarrier !== 'USPS' || weight <= 0) return null;
    const retail = getUspsZone1Rate(weight);
    if (retail === null) return null;
    const saving = retail - effectiveRate;
    return saving > 0 ? { retail, saving } : null;
  }, [selectedCarrier, weight, effectiveRate]);

  const activeCfg  = selectedCarrier ? CARRIER_CFG[selectedCarrier] : null;
  const fromFilled = !!(form.from_name.trim() && form.from_address1.trim() && form.from_city.trim());
  const toFilled   = !!(form.to_name.trim()   && form.to_address1.trim()   && form.to_city.trim());
  const canSwap    = fromFilled && toFilled;

  // Dim calculations
  const dimL      = parseFloat(form.length) || 0;
  const dimW      = parseFloat(form.width)  || 0;
  const dimH      = parseFloat(form.height) || 0;
  const hasDims   = dimL > 0 && dimW > 0 && dimH > 0;
  const volume    = hasDims ? dimL * dimW * dimH : 0;
  const dimDivisor = selectedCarrier === 'USPS' ? 166 : 139;
  const dimApplies = hasDims && (selectedCarrier === 'USPS' ? volume > 1728 : true);
  const dimWeight  = dimApplies ? volume / dimDivisor : 0;
  const dimOverage = dimApplies && weight > 0 && dimWeight > weight;

  // Section completion
  const serviceDone = !!selectedVendorId;
  const routeDone   = fromFilled && toFilled;
  const packageDone = weight > 0;
  const allDone     = serviceDone && routeDone && packageDone;

  // Pulse Generate button once when all sections flip to done
  useEffect(() => {
    if (allDone && !prevAllDone.current) setPulseKey(k => k + 1);
    prevAllDone.current = allDone;
  }, [allDone]);

  const flash = (set: React.Dispatch<React.SetStateAction<boolean>>) => {
    set(true);
    setTimeout(() => set(false), 700);
  };

  const handleSwap = () => {
    if (!canSwap) return;
    setForm((f: typeof BLANK_FORM) => ({
      ...f,
      from_name: f.to_name, from_company: f.to_company, from_phone: f.to_phone,
      from_address1: f.to_address1, from_address2: f.to_address2,
      from_city: f.to_city, from_state: f.to_state, from_zip: f.to_zip, from_country: f.to_country,
      to_name: f.from_name, to_company: f.from_company, to_phone: f.from_phone,
      to_address1: f.from_address1, to_address2: f.from_address2,
      to_city: f.from_city, to_state: f.from_state, to_zip: f.from_zip, to_country: f.from_country,
    }));
  };

  // Warehouse handlers
  const loadWarehouse = (wh: Warehouse) => {
    setForm((f: typeof BLANK_FORM) => ({
      ...f,
      from_name: wh.name, from_company: wh.company, from_phone: wh.phone,
      from_address1: wh.address1, from_address2: wh.address2,
      from_city: wh.city, from_state: wh.state, from_zip: wh.zip,
    }));
    flash(setFlashFrom);
    setShowWhPanel(false);
  };

  const saveWarehouse = () => {
    const label = newWhLabel.trim() || `Warehouse ${warehouses.length + 1}`;
    const wh: Warehouse = {
      id: Date.now().toString(), label,
      name: form.from_name, company: form.from_company, phone: form.from_phone,
      address1: form.from_address1, address2: form.from_address2,
      city: form.from_city, state: form.from_state, zip: form.from_zip,
    };
    const updated = [...warehouses, wh];
    setWarehouses(updated); saveWarehouses(updated); setNewWhLabel('');
  };

  const deleteWarehouse = (id: string) => {
    const updated = warehouses.filter(w => w.id !== id);
    setWarehouses(updated); saveWarehouses(updated);
  };

  // Recipient handlers
  const loadRecipient = (r: Recipient) => {
    setForm((f: typeof BLANK_FORM) => ({
      ...f,
      to_name: r.name, to_company: r.company, to_phone: r.phone,
      to_address1: r.address1, to_address2: r.address2,
      to_city: r.city, to_state: r.state, to_zip: r.zip,
    }));
    flash(setFlashTo);
    setShowRcpPanel(false);
  };

  const saveRecipient = () => {
    const label = newRcpLabel.trim() || form.to_name.trim() || `Recipient ${recipients.length + 1}`;
    const r: Recipient = {
      id: Date.now().toString(), label,
      name: form.to_name, company: form.to_company, phone: form.to_phone,
      address1: form.to_address1, address2: form.to_address2,
      city: form.to_city, state: form.to_state, zip: form.to_zip,
    };
    const updated = [...recipients, r];
    setRecipients(updated); saveRecipients(updated); setNewRcpLabel('');
  };

  const deleteRecipient = (id: string) => {
    const updated = recipients.filter(r => r.id !== id);
    setRecipients(updated); saveRecipients(updated);
  };

  // Dim preset handlers
  const loadDimPreset = (p: DimPreset) => {
    setForm((f: typeof BLANK_FORM) => ({ ...f, length: p.length, width: p.width, height: p.height }));
    flash(setFlashDims);
    setShowDimPanel(false);
  };

  const applyQuickPackage = (pkg: typeof COMMON_PACKAGES[0]) => {
    setForm((f: typeof BLANK_FORM) => ({ ...f, length: pkg.length, width: pkg.width, height: pkg.height }));
    flash(setFlashDims);
    setShowDimPanel(false);
  };

  const saveDimPreset = () => {
    if (!hasDims) return;
    const label = newDimLabel.trim() || `${dimL}×${dimW}×${dimH}`;
    const preset: DimPreset = { id: Date.now().toString(), label, length: form.length, width: form.width, height: form.height };
    const updated = [...dimPresets, preset];
    setDimPresets(updated); saveDimPresets(updated); setNewDimLabel('');
  };

  const deleteDimPreset = (id: string) => {
    const updated = dimPresets.filter(p => p.id !== id);
    setDimPresets(updated); saveDimPresets(updated);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendorId) { setError('Select a carrier and vendor first.'); return; }
    setIsLoading(true); setError('');
    try {
      const res = await axios.post('/labels/single', {
        vendorId: selectedVendorId,
        ...form,
        ...(selectedSeries ? { shiplabel_series: selectedSeries } : {}),
      });
      const labelId  = res.data.label?.id;
      const tracking = res.data.label?.trackingId || Date.now();
      (window as any).gtag?.('event', 'label_created', { carrier: res.data.label?.carrier ?? 'unknown' });
      (window as any).fbq?.('track', 'Purchase', { value: res.data.label?.cost ?? 0, currency: 'USD' });
      if (labelId) {
        try {
          const pdfRes = await axios.get(`/labels/${labelId}/pdf`, { responseType: 'blob' });
          const blobUrl = window.URL.createObjectURL(new Blob([pdfRes.data], { type: 'application/pdf' }));
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `label-${tracking}.pdf`;
          document.body.appendChild(link); link.click(); document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        } catch (pdfErr) {
          console.error('PDF download failed', pdfErr);
        }
      }
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors?.length) {
        setError(data.errors.map((e: any) => e.msg).join(' · '));
      } else {
        setError(data?.message || 'Failed to generate label');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Reusable panel header dropdown button style
  const panelBtnStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 4, height: 28, padding: '0 9px',
    background: active ? '#EEF2FF' : 'var(--bg-card)',
    border: `1.5px solid ${active ? '#6366F1' : 'var(--navy-200)'}`,
    borderRadius: 7, cursor: 'pointer', color: active ? '#4F46E5' : 'var(--navy-500)',
    fontSize: '0.72rem', fontWeight: 600, fontFamily: FONT, transition: 'all 0.12s',
  });

  const panelDropStyle: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
    background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)',
    borderRadius: 10, boxShadow: 'var(--shadow-lg)', width: 290, padding: '0.75rem',
  };

  const panelSectionLbl: React.CSSProperties = {
    fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)',
    letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: FONT,
  };

  const panelSaveInput: React.CSSProperties = {
    flex: 1, padding: '0.45rem 0.6rem', fontSize: '0.76rem',
    border: '1.5px solid var(--navy-200)', borderRadius: 7, outline: 'none',
    fontFamily: FONT, background: 'var(--bg-card)', color: 'var(--navy-800)',
  };

  return (
    <>
      <style>{`
        @keyframes pulse-btn {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.055); }
          100% { transform: scale(1); }
        }
        @keyframes flash-section {
          0%   { background-color: rgba(254,252,232,0.85); }
          100% { background-color: transparent; }
        }
        @media (max-width: 768px) {
          .label-gen-bottom-bar {
            left: 0 !important;
            padding: 0.65rem 0.9rem !important;
          }
        }
      `}</style>

      {showManifestModal && (
        <div className="modal-overlay" onClick={() => setShowManifestModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.875rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--warning-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TruckIcon style={{ width: 18, height: 18, color: 'var(--warning-600)' }} />
              </div>
              <h3 className="modal-title" style={{ margin: 0, fontFamily: FONT }}>Manifested Vendor</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--navy-600)', marginBottom: '1.25rem', lineHeight: 1.6, fontFamily: FONT }}>
              Single label generation is not available for manifested services. Use <strong>Bulk Labels</strong> to submit a manifest job.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowManifestModal(false)}>Dismiss</button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/labels/bulk')}>Go to Bulk Labels</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontFamily: FONT, paddingBottom: 96 }}>

        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
          borderRadius: 18, padding: '1.25rem 1.8rem',
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '-40%', right: '6%', width: 200, height: 200, background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TagIcon style={{ width: 22, height: 22, color: '#818CF8' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1, fontFamily: FONT }}>Label Generator</h1>
              <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'rgba(148,163,184,0.65)', fontFamily: FONT }}>Single-label shipment · fill below and generate</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, flexWrap: 'wrap' }}>
            {isReturn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.45rem 0.875rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FCD34D', fontFamily: FONT }}>↩ Return Label</span>
                <button type="button" onClick={() => { setIsReturn(false); setForm(BLANK_FORM); setSelectedCarrier(''); setSelectedVendorId(''); }}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', borderRadius: 4, display: 'flex', padding: '2px 3px' }}>
                  <XMarkIcon style={{ width: 12, height: 12 }} />
                </button>
              </div>
            )}
            {[
              { label: 'Carrier', value: selectedCarrier || '—', accent: activeCfg ? activeCfg.solid : 'rgba(255,255,255,0.35)' },
              { label: 'Vendor',  value: selectedAccess?.vendorName || '—', accent: 'rgba(255,255,255,0.45)' },
            ].map(({ label, value, accent }) => (
              <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.42rem 0.8rem', minWidth: 80 }}>
                <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontFamily: FONT }}>{label}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: accent, fontFamily: FONT, marginTop: 2, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <form id="label-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

          {/* ── Service card ─────────────────────────────────────────────────────── */}
          <div className="db-card">

            {/* Portal row — dot represents whole card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.6rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
              <Dot done={serviceDone} />
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 52, fontFamily: FONT }}>Portal</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {PORTALS.map(p => {
                  const sel = selectedPortal === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => handlePortalSelect(p.id)}
                      style={{ padding: '4px 11px', borderRadius: 6, fontSize: '0.74rem', fontWeight: sel ? 700 : 500, border: `1.5px solid ${sel ? p.color : 'var(--navy-200)'}`, background: sel ? p.bg : 'transparent', color: sel ? p.color : 'var(--navy-500)', cursor: 'pointer', transition: 'all 0.15s', fontFamily: FONT, outline: 'none' }}>
                      {portalLabels[p.id] || DEFAULT_PORTAL_LABELS[p.id]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Carrier row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.6rem 1rem', paddingLeft: '2rem', borderBottom: '1px solid var(--navy-100)' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 52, fontFamily: FONT }}>Carrier</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {CARRIERS.map(c => {
                  const cfg = CARRIER_CFG[c];
                  const sel = selectedCarrier === c;
                  return (
                    <button key={c} type="button" onClick={() => handleCarrierSelect(c)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, padding: '4px 12px', borderRadius: 7, border: `1.5px solid ${sel ? cfg.solid : 'var(--navy-200)'}`, background: sel ? cfg.light : 'var(--bg-card)', cursor: 'pointer', transition: 'all 0.15s', outline: 'none', boxShadow: sel ? `0 0 0 2.5px ${cfg.solid}22` : 'none' }}>
                      <img src={cfg.logo} alt={c} style={{ height: 22, width: 'auto', maxWidth: 72, objectFit: 'contain' }} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vendor row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.6rem 1rem', paddingLeft: '2rem' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 52, fontFamily: FONT }}>Vendor</span>

              {selectedCarrier && carrierVendors.length === 0 ? (
                /* ── Item 2: No vendors message ── */
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 12px' }}>
                  <ExclamationCircleIcon style={{ width: 14, height: 14, color: '#D97706', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', color: '#92400E', fontFamily: FONT }}>
                    No <strong>{selectedCarrier}</strong> vendors assigned on <strong>{portalLabels[selectedPortal] || DEFAULT_PORTAL_LABELS[selectedPortal]}</strong>. Contact your admin or switch portal.
                  </span>
                </div>
              ) : (
                <>
                  <select value={selectedVendorId} onChange={handleVendorChange} disabled={!selectedCarrier}
                    style={{ flex: 1, height: 34, padding: '0 0.75rem', border: `1.5px solid ${selectedVendorId ? (activeCfg?.solid ?? '#6366f1') : 'var(--navy-200)'}`, borderRadius: 7, fontSize: '0.82rem', fontWeight: selectedVendorId ? 600 : 400, color: selectedVendorId ? 'var(--navy-900)' : 'var(--navy-400)', background: 'var(--bg-card)', cursor: selectedCarrier ? 'pointer' : 'not-allowed', outline: 'none', fontFamily: FONT, opacity: selectedCarrier ? 1 : 0.5, transition: 'border-color 0.15s' }}>
                    <option value="">{selectedCarrier ? `— ${selectedCarrier} service —` : '— select a carrier first —'}</option>
                    {carrierVendors.map(v => (
                      <option key={v.vendorId} value={v.vendorId}>
                        {v.vendorName}{v.shippingService ? ` · ${v.shippingService}` : ''}{v.vendorType === 'manifest' ? ' (Manifest)' : ''}
                      </option>
                    ))}
                  </select>

                  {needsSeriesPick && (
                    <select
                      value={selectedSeries}
                      onChange={e => setSelectedSeries(e.target.value)}
                      style={{ height: 36, padding: '0 10px', border: `1.5px solid ${selectedSeries ? '#059669' : '#f59e0b'}`, borderRadius: 8, fontSize: '0.82rem', fontFamily: FONT, color: 'var(--navy-800)', background: '#fff', cursor: 'pointer', outline: 'none', minWidth: 160 }}
                    >
                      <option value="">— select series —</option>
                      {activeSeriesOptions.map(opt => (
                        <option key={opt.series} value={opt.series}>
                          {opt.name ? `${opt.name} (${opt.series})` : opt.series}
                        </option>
                      ))}
                    </select>
                  )}

                  {selectedAccess && weight > 0 && (
                    <span style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 7, padding: '4px 11px', fontSize: '0.85rem', fontWeight: 800, fontFamily: FONT, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                      ${effectiveRate.toFixed(2)}
                    </span>
                  )}
                  {uspsSaving && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ECFDF5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: 20, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700, fontFamily: FONT, whiteSpace: 'nowrap' }}>
                      <SparklesIcon style={{ width: 10, height: 10 }} />
                      Save ${uspsSaving.saving.toFixed(2)} vs retail
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Route card ───────────────────────────────────────────────────────── */}
          <div className="db-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-50)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dot done={routeDone} />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>Shipment Route</span>
              </div>
              <button type="button" onClick={handleSwap} disabled={!canSwap}
                title={canSwap ? 'Swap FROM ↔ TO' : 'Fill both addresses first'}
                style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: 7, border: `1.5px solid ${canSwap ? '#6366F1' : 'var(--navy-200)'}`, background: canSwap ? '#EEF2FF' : 'var(--navy-50)', color: canSwap ? '#4F46E5' : 'var(--navy-400)', cursor: canSwap ? 'pointer' : 'not-allowed', fontSize: '0.73rem', fontWeight: 600, fontFamily: FONT, transition: 'all 0.15s' }}>
                <ArrowsRightLeftIcon style={{ width: 13, height: 13 }} />
                Swap
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

              {/* FROM column */}
              <div style={{ padding: '1.1rem 1.25rem', borderRight: '1px solid var(--navy-100)', animation: flashFrom ? 'flash-section 0.7s ease forwards' : 'none', borderRadius: '0 0 0 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1' }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-700)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>From</span>
                  </div>

                  {/* Warehouses dropdown — ref scoped to button+panel only */}
                  <div style={{ position: 'relative' }} ref={whBtnRef}>
                    <button type="button" onClick={() => setShowWhPanel(v => !v)} style={panelBtnStyle(showWhPanel)}>
                      <BuildingOfficeIcon style={{ width: 12, height: 12 }} />
                      Warehouses
                      <ChevronDownIcon style={{ width: 10, height: 10, transform: showWhPanel ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>

                    {showWhPanel && (
                      <div style={panelDropStyle}>
                        <div style={panelSectionLbl}>Saved Warehouses</div>
                        {warehouses.length === 0 ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', padding: '0.25rem 0', marginBottom: 8, fontFamily: FONT }}>No warehouses saved yet.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, maxHeight: 190, overflowY: 'auto' }}>
                            {warehouses.map(wh => (
                              <PanelRow key={wh.id}
                                icon={<BuildingOfficeIcon style={{ width: 13, height: 13, color: '#6366F1', flexShrink: 0 }} />}
                                title={wh.label}
                                subtitle={`${wh.address1}, ${wh.city}, ${wh.state}`}
                                onLoad={() => loadWarehouse(wh)}
                                onDelete={() => deleteWarehouse(wh.id)}
                              />
                            ))}
                          </div>
                        )}
                        <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: 8 }}>
                          <div style={{ ...panelSectionLbl, marginBottom: 5 }}>Save current FROM</div>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <input type="text" value={newWhLabel} onChange={e => setNewWhLabel(e.target.value)} placeholder="e.g. NYC Warehouse"
                              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), saveWarehouse())}
                              style={panelSaveInput} />
                            <button type="button" onClick={saveWarehouse} disabled={!form.from_name.trim() && !form.from_address1.trim()}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.45rem 0.75rem', borderRadius: 7, border: 'none', background: '#6366F1', color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: FONT }}>
                              <PlusIcon style={{ width: 11, height: 11 }} /> Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label="Name"        name="from_name"     value={form.from_name}     onChange={handleChange} required />
                  <F label="Company"     name="from_company"  value={form.from_company}  onChange={handleChange} />
                  <div style={{ gridColumn: 'span 2', position: 'relative' }} ref={fromSuggRef}>
                    <div style={fieldLabel}>Address<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></div>
                    <input name="from_address1" type="text" required value={form.from_address1} autoComplete="off"
                      placeholder="Start typing to search…"
                      onChange={e => handleAddressChange(e, 'from')}
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#6366f1')}
                      onBlur={e  => (e.target.style.borderColor = 'var(--navy-200)')}
                    />
                    {showFromSugg && fromSugg.length > 0 && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                        {fromSugg.map((s, i) => (
                          <button key={i} type="button" onMouseDown={() => selectSuggestion(s, 'from')}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 0.875rem', border: 'none', borderBottom: i < fromSugg.length - 1 ? '1px solid var(--navy-100)' : 'none', background: 'transparent', cursor: 'pointer', fontFamily: FONT }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)' }}>{s.address1}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--navy-500)', marginTop: 1 }}>{s.city}{s.state ? `, ${s.state}` : ''}{s.zip ? ` ${s.zip}` : ''}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {suggError && <div style={{ fontSize: '0.7rem', color: '#DC2626', marginTop: 4, fontFamily: FONT }}>{suggError}</div>}
                  </div>
                  <F label="Apt / Suite" name="from_address2" value={form.from_address2} onChange={handleChange} />
                  <F label="Phone"       name="from_phone"    value={form.from_phone}    onChange={handleChange} />
                  <F label="City"        name="from_city"     value={form.from_city}     onChange={handleChange} required />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', gridColumn: 'span 1' }}>
                    <StateSelect name="from_state" value={form.from_state} onChange={handleChange as any} />
                    <F label="ZIP" name="from_zip" value={form.from_zip} onChange={handleChange} required placeholder="5-digit" />
                  </div>
                </div>
              </div>

              {/* TO column */}
              <div style={{ padding: '1.1rem 1.25rem', animation: flashTo ? 'flash-section 0.7s ease forwards' : 'none', borderRadius: '0 0 16px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A' }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-700)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>To</span>
                  </div>

                  {/* ── Item 6: Recipients dropdown ── */}
                  <div style={{ position: 'relative' }} ref={rcpBtnRef}>
                    <button type="button" onClick={() => setShowRcpPanel(v => !v)} style={panelBtnStyle(showRcpPanel)}>
                      <UserIcon style={{ width: 12, height: 12 }} />
                      Recipients
                      <ChevronDownIcon style={{ width: 10, height: 10, transform: showRcpPanel ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>

                    {showRcpPanel && (
                      <div style={panelDropStyle}>
                        <div style={panelSectionLbl}>Saved Recipients</div>
                        {recipients.length === 0 ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', padding: '0.25rem 0', marginBottom: 8, fontFamily: FONT }}>No recipients saved yet.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, maxHeight: 190, overflowY: 'auto' }}>
                            {recipients.map(r => (
                              <PanelRow key={r.id}
                                icon={<UserIcon style={{ width: 13, height: 13, color: '#16A34A', flexShrink: 0 }} />}
                                title={r.label}
                                subtitle={`${r.address1}, ${r.city}, ${r.state}`}
                                onLoad={() => loadRecipient(r)}
                                onDelete={() => deleteRecipient(r.id)}
                              />
                            ))}
                          </div>
                        )}
                        <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: 8 }}>
                          <div style={{ ...panelSectionLbl, marginBottom: 5 }}>Save current TO</div>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <input type="text" value={newRcpLabel} onChange={e => setNewRcpLabel(e.target.value)} placeholder="e.g. John Smith"
                              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), saveRecipient())}
                              style={panelSaveInput} />
                            <button type="button" onClick={saveRecipient} disabled={!form.to_name.trim() && !form.to_address1.trim()}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.45rem 0.75rem', borderRadius: 7, border: 'none', background: '#16A34A', color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: FONT }}>
                              <PlusIcon style={{ width: 11, height: 11 }} /> Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label="Name"        name="to_name"     value={form.to_name}     onChange={handleChange} required />
                  <F label="Company"     name="to_company"  value={form.to_company}  onChange={handleChange} />
                  <div style={{ gridColumn: 'span 2', position: 'relative' }} ref={toSuggRef}>
                    <div style={fieldLabel}>Address<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></div>
                    <input name="to_address1" type="text" required value={form.to_address1} autoComplete="off"
                      placeholder="Start typing to search…"
                      onChange={e => handleAddressChange(e, 'to')}
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#6366f1')}
                      onBlur={e  => (e.target.style.borderColor = 'var(--navy-200)')}
                    />
                    {showToSugg && toSugg.length > 0 && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                        {toSugg.map((s, i) => (
                          <button key={i} type="button" onMouseDown={() => selectSuggestion(s, 'to')}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 0.875rem', border: 'none', borderBottom: i < toSugg.length - 1 ? '1px solid var(--navy-100)' : 'none', background: 'transparent', cursor: 'pointer', fontFamily: FONT }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)' }}>{s.address1}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--navy-500)', marginTop: 1 }}>{s.city}{s.state ? `, ${s.state}` : ''}{s.zip ? ` ${s.zip}` : ''}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {suggError && <div style={{ fontSize: '0.7rem', color: '#DC2626', marginTop: 4, fontFamily: FONT }}>{suggError}</div>}
                  </div>
                  <F label="Apt / Suite" name="to_address2" value={form.to_address2} onChange={handleChange} />
                  <F label="Phone"       name="to_phone"    value={form.to_phone}    onChange={handleChange} />
                  <F label="City"        name="to_city"     value={form.to_city}     onChange={handleChange} required />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', gridColumn: 'span 1' }}>
                    <StateSelect name="to_state" value={form.to_state} onChange={handleChange as any} />
                    <F label="ZIP" name="to_zip" value={form.to_zip} onChange={handleChange} required placeholder="5-digit" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Package Details card ─────────────────────────────────────────────── */}
          <div className="db-card" style={{ padding: '1.1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dot done={packageDone} />
                <div style={{ width: 3, height: 13, borderRadius: 3, background: 'var(--accent-500)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>Package Details</span>
              </div>

              <div style={{ position: 'relative' }} ref={dimPanelRef}>
                <button type="button" onClick={() => setShowDimPanel(v => !v)} style={panelBtnStyle(showDimPanel)}>
                  <CubeIcon style={{ width: 12, height: 12 }} />
                  Packages
                  <ChevronDownIcon style={{ width: 10, height: 10, transform: showDimPanel ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>

                {showDimPanel && (
                  <div style={{ ...panelDropStyle, bottom: 'calc(100% + 6px)', top: 'auto', width: 320 }}>
                    <div style={panelSectionLbl}>Common Sizes</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                      {COMMON_PACKAGES.map(pkg => (
                        <button key={pkg.label} type="button" onClick={() => applyQuickPackage(pkg)}
                          style={{ padding: '3px 9px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, border: '1.5px solid var(--navy-200)', background: 'var(--navy-50)', color: 'var(--navy-700)', cursor: 'pointer', fontFamily: FONT, transition: 'all 0.1s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.color = '#4F46E5'; e.currentTarget.style.background = '#EEF2FF'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--navy-200)'; e.currentTarget.style.color = 'var(--navy-700)'; e.currentTarget.style.background = 'var(--navy-50)'; }}>
                          {pkg.label}
                          <span style={{ marginLeft: 4, opacity: 0.45, fontSize: '0.62rem' }}>{pkg.length}×{pkg.width}×{pkg.height}</span>
                        </button>
                      ))}
                    </div>

                    <div style={panelSectionLbl}>Saved Presets</div>
                    {dimPresets.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', padding: '0.2rem 0', marginBottom: 8, fontFamily: FONT }}>No presets saved yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, maxHeight: 150, overflowY: 'auto' }}>
                        {dimPresets.map(p => (
                          <PanelRow key={p.id}
                            icon={<CubeIcon style={{ width: 13, height: 13, color: '#6366F1', flexShrink: 0 }} />}
                            title={p.label}
                            subtitle={`${p.length}″ × ${p.width}″ × ${p.height}″`}
                            onLoad={() => loadDimPreset(p)}
                            onDelete={() => deleteDimPreset(p.id)}
                          />
                        ))}
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: 8 }}>
                      <div style={{ ...panelSectionLbl, marginBottom: 5 }}>Save current dims</div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input type="text" value={newDimLabel} onChange={e => setNewDimLabel(e.target.value)} placeholder="e.g. Standard Box"
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), saveDimPreset())}
                          style={panelSaveInput} />
                        <button type="button" onClick={saveDimPreset} disabled={!hasDims}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.45rem 0.75rem', borderRadius: 7, border: 'none', background: hasDims ? '#6366F1' : 'var(--navy-200)', color: hasDims ? '#fff' : 'var(--navy-400)', fontSize: '0.72rem', fontWeight: 700, cursor: hasDims ? 'pointer' : 'not-allowed', flexShrink: 0, fontFamily: FONT }}>
                          <PlusIcon style={{ width: 11, height: 11 }} /> Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Weight + dims fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', animation: flashDims ? 'flash-section 0.7s ease forwards' : 'none', borderRadius: 8 }}>
              <F label="Weight (lbs)" name="weight" value={form.weight} onChange={handleChange} type="number" step="0.1" min="0" required />
              <F label="Length (in)"  name="length" value={form.length} onChange={handleChange} type="number" step="0.1" min="0" />
              <F label="Width (in)"   name="width"  value={form.width}  onChange={handleChange} type="number" step="0.1" min="0" />
              <F label="Height (in)"  name="height" value={form.height} onChange={handleChange} type="number" step="0.1" min="0" />
            </div>

            {/* Note on its own row */}
            <div style={{ marginTop: '0.75rem' }}>
              <div style={fieldLabel}>Note</div>
              <input name="note" type="text" value={form.note} onChange={handleChange as any}
                placeholder="Optional delivery note…"
                style={{ ...inputStyle, width: '100%' }}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e  => (e.target.style.borderColor = 'var(--navy-200)')}
              />
            </div>

            {/* DIM weight + volume row */}
            {hasDims && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid var(--navy-100)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: FONT, fontWeight: 600 }}>Dims:</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>{dimL}″ × {dimW}″ × {dimH}″</span>
                <span style={{ width: 1, height: 12, background: 'var(--navy-200)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: FONT, fontWeight: 600 }}>Volume:</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>{volume.toLocaleString()} cu in</span>
                <span style={{ width: 1, height: 12, background: 'var(--navy-200)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: FONT, fontWeight: 600 }}>DIM wt:</span>
                {dimApplies ? (
                  <>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, fontFamily: FONT, color: dimOverage ? '#DC2626' : '#15803D', background: dimOverage ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${dimOverage ? '#FECACA' : '#BBF7D0'}`, borderRadius: 6, padding: '1px 8px' }}>
                      {dimWeight.toFixed(2)} lbs
                    </span>
                    {dimOverage && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, color: '#DC2626', fontFamily: FONT }}>
                        <ExclamationCircleIcon style={{ width: 12, height: 12, flexShrink: 0 }} />
                        DIM exceeds actual — carrier may bill {dimWeight.toFixed(2)} lbs
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-400)', fontFamily: FONT, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', borderRadius: 6, padding: '1px 8px' }}>
                    N/A — USPS DIM only applies above 1 cu ft
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1.5px solid #FECACA', background: '#FFF5F5' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.875rem 1rem' }}>
                <ExclamationCircleIcon style={{ width: 18, height: 18, color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', color: '#DC2626', fontFamily: FONT, lineHeight: 1.5 }}>{error}</div>
                </div>
                <button type="button" onClick={() => setError('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', opacity: 0.5, padding: '2px 4px', flexShrink: 0 }}>
                  <XMarkIcon style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          )}

        </form>
      </div>

      {/* Sticky bottom bar */}
      <div className="label-gen-bottom-bar" style={{ position: 'fixed', bottom: 0, right: 0, left: 'var(--sidebar-w, 256px)', background: 'rgba(15,23,42,0.97)', backdropFilter: 'blur(12px)', borderTop: `1px solid ${canSubmit && weight > 0 ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`, zIndex: 200, padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'border-color 0.3s' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
          {canSubmit ? (
            <>
              {selectedCarrier && (
                <span style={{ background: activeCfg ? `${activeCfg.light}22` : 'rgba(255,255,255,0.06)', border: `1px solid ${activeCfg ? `${activeCfg.solid}44` : 'rgba(255,255,255,0.1)'}`, color: activeCfg ? activeCfg.solid : '#94A3B8', borderRadius: 6, padding: '3px 9px', fontSize: '0.72rem', fontWeight: 700, fontFamily: FONT }}>
                  {selectedCarrier}
                </span>
              )}
              {selectedAccess && <span style={{ fontSize: '0.78rem', color: 'rgba(148,163,184,0.8)', fontFamily: FONT }}>{selectedAccess.vendorName}</span>}
              {weight > 0 && <span style={{ fontSize: '0.78rem', color: 'rgba(148,163,184,0.6)', fontFamily: FONT }}>{weight} lbs</span>}
              {weight > 0 && selectedVendorId && <span style={{ fontSize: '1rem', fontWeight: 900, color: '#34D399', letterSpacing: '-0.02em', fontFamily: FONT }}>${effectiveRate.toFixed(2)}</span>}
              {uspsSaving && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#34D399', fontFamily: FONT }}>
                  <SparklesIcon style={{ width: 11, height: 11 }} />
                  Save ${uspsSaving.saving.toFixed(2)} vs retail
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'rgba(148,163,184,0.45)', fontFamily: FONT }}>
              {!selectedCarrier ? '← Select portal, carrier, and vendor above' : !selectedVendorId ? '← Pick a vendor' : 'Enter weight above'}
            </span>
          )}
        </div>

        {/* ── Item 9: Generate button pulses when all 3 sections are complete ── */}
        <button
          key={`gen-${pulseKey}`}
          type="submit"
          form="label-form"
          disabled={!canSubmit}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            height: 42, padding: '0 24px', borderRadius: 10, border: 'none',
            background: canSubmit ? (activeCfg ? activeCfg.solid : '#6366F1') : 'rgba(255,255,255,0.08)',
            color: canSubmit ? '#fff' : 'rgba(255,255,255,0.25)',
            fontSize: '0.88rem', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: FONT, whiteSpace: 'nowrap',
            boxShadow: canSubmit ? `0 4px 16px ${activeCfg ? activeCfg.solid : '#6366F1'}50` : 'none',
            transition: 'background 0.2s, box-shadow 0.2s',
            animation: pulseKey > 0 ? 'pulse-btn 0.45s ease' : 'none',
          }}
          onMouseEnter={e => { if (canSubmit) (e.currentTarget.style.filter = 'brightness(1.1)'); }}
          onMouseLeave={e => { (e.currentTarget.style.filter = 'none'); }}
        >
          {isLoading
            ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Generating…</>
            : <><ArrowDownTrayIcon style={{ width: 16, height: 16 }} /> Generate Label{canSubmit && weight > 0 ? ` · $${effectiveRate.toFixed(2)}` : ''}</>
          }
        </button>
      </div>
    </>
  );
};

export default LabelGenerator;
