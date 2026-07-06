// Canonical tracking-status values (mirrors client TS_CONFIG in LabelHistory.tsx)
// Note: "exception_problem" doubles as the unpaid-postage status — USPS surfaces
// unpaid postage as a scan exception, so it's tracked under Exception/Problem rather
// than as its own status.
const TS_VALUES = [
  'not_scanned_yet', 'in_transit', 'out_for_delivery', 'delivered',
  'exception_problem', 'returned_to_sender', 'pending_pickup', 'delayed',
];

// Legacy DB values stored before the tracking-status enum migration
const TS_LEGACY_ALIASES = {
  not_scanned_yet:    ['not_scanned', null, undefined],
  exception_problem:  ['exception'],
  returned_to_sender: ['return_to_sender'],
};

/** Build a Mongo query fragment for a canonical tracking-status filter value, honoring legacy aliases */
function buildTrackingStatusFilter(value) {
  if (!TS_VALUES.includes(value)) return {};
  const aliases = TS_LEGACY_ALIASES[value] || [];
  const values = [value, ...aliases];
  if (values.includes(null) || values.includes(undefined)) {
    return { $or: [{ trackingStatus: { $exists: false } }, { trackingStatus: { $in: values } }] };
  }
  return { trackingStatus: { $in: values } };
}

// Mongo aggregation expression that normalizes trackingStatus into its canonical value
const NORMALIZED_TS_EXPR = {
  $let: {
    vars: { ts: { $ifNull: ['$trackingStatus', 'not_scanned_yet'] } },
    in: {
      $switch: {
        branches: [
          { case: { $eq: ['$$ts', 'not_scanned'] },       then: 'not_scanned_yet' },
          { case: { $eq: ['$$ts', 'exception'] },         then: 'exception_problem' },
          { case: { $eq: ['$$ts', 'return_to_sender'] },  then: 'returned_to_sender' },
        ],
        default: '$$ts',
      },
    },
  },
};

/** Build a { statusKey: 0, ... } skeleton plus fill counts from an aggregate `{ _id, count }` result set */
function tallyStatusCounts(aggResult) {
  const counts = Object.fromEntries(TS_VALUES.map(v => [v, 0]));
  for (const g of aggResult) {
    if (g._id in counts) counts[g._id] += g.count;
  }
  return counts;
}

module.exports = { TS_VALUES, TS_LEGACY_ALIASES, buildTrackingStatusFilter, NORMALIZED_TS_EXPR, tallyStatusCounts };
