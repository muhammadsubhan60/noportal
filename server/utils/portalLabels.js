const User = require('../models/User');

// Raw brand — shown to admins/resellers who manage vendor config.
const RAW_PORTAL_NAMES = { shippershub: 'ShippersHub', labelcrow: 'Label Crow', shiplabel: 'ShipLabel' };
// Safe fallback for a reseller's client until the reseller sets a custom label —
// never the raw brand, since that's the whole point of white-labeling.
const GENERIC_PORTAL_NAMES = { shippershub: 'Standard', labelcrow: 'Express', shiplabel: 'Priority' };

// A plain `user` account's owning reseller custom names, null where the reseller
// hasn't set one. Everyone else (admin/reseller) has no owning reseller to look up.
async function getResellerPortalOverrides(requestingUser) {
  if (requestingUser.role !== 'user') return { shippershub: null, labelcrow: null, shiplabel: null };

  const reseller = await User.findOne({ role: 'reseller', clients: requestingUser._id })
    .select('portalLabels').lean();
  const overrides = reseller?.portalLabels || {};

  return {
    shippershub: overrides.shippershub || null,
    labelcrow:   overrides.labelcrow   || null,
    shiplabel:   overrides.shiplabel   || null,
  };
}

// For the label-generation pickers (Single/Bulk): unset falls back to a generic
// neutral name — never the raw brand, since that's the whole point there.
async function resolvePortalLabels(requestingUser) {
  if (requestingUser.role !== 'user') return { ...RAW_PORTAL_NAMES };
  const overrides = await getResellerPortalOverrides(requestingUser);
  return {
    shippershub: overrides.shippershub || GENERIC_PORTAL_NAMES.shippershub,
    labelcrow:   overrides.labelcrow   || GENERIC_PORTAL_NAMES.labelcrow,
    shiplabel:   overrides.shiplabel   || GENERIC_PORTAL_NAMES.shiplabel,
  };
}

// For the Leaderboard: unset falls back to the raw brand name (today's behavior) —
// a deliberate product choice, unlike the pickers above.
async function resolvePortalLabelsRawFallback(requestingUser) {
  if (requestingUser.role !== 'user') return { ...RAW_PORTAL_NAMES };
  const overrides = await getResellerPortalOverrides(requestingUser);
  return {
    shippershub: overrides.shippershub || RAW_PORTAL_NAMES.shippershub,
    labelcrow:   overrides.labelcrow   || RAW_PORTAL_NAMES.labelcrow,
    shiplabel:   overrides.shiplabel   || RAW_PORTAL_NAMES.shiplabel,
  };
}

module.exports = {
  RAW_PORTAL_NAMES,
  GENERIC_PORTAL_NAMES,
  resolvePortalLabels,
  resolvePortalLabelsRawFallback,
};
