/**
 * SYNTHETIC TEST INPUT FIXTURES
 * WARNING: These are synthetic test fixtures strictly for unit tests.
 * Never import or use these fixtures in production application code.
 */

export const SYNTHETIC_MODIS_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
23.8103,90.4125,315.4,1.1,1.0,2024-01-15,445,Terra,MODIS,85,6.1,290.1,18.2,D
22.3569,91.7832,305.2,1.0,1.0,2024-01-15,1330,Aqua,MODIS,25,6.1,288.4,7.5,N
`;

export const SYNTHETIC_VIIRS_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
23.8120,90.4110,330.5,0.4,0.4,2024-01-15,0450,N,VIIRS,h,2.0,295.0,22.1,D
22.3600,91.7800,310.0,0.4,0.4,2024-01-15,1345,N,VIIRS,l,2.0,290.0,4.2,N
`;

export const SYNTHETIC_HEADER_ONLY_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
`;

export const SYNTHETIC_INVALID_KEY_RESPONSE = `Invalid MAP_KEY or unauthorized access.`;

export const SYNTHETIC_RATE_LIMIT_RESPONSE = `Error: rate limit exceeded for request.`;
