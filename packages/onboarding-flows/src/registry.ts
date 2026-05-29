import type { VendorFlow } from './types.js';
import { validateVendorFlow } from './factory.js';
import { siteMinderFlow }      from './vendors/siteminder.js';
import { travelClickFlow }     from './vendors/travelclick.js';
// Batch 1
import { mewsFlow }            from './vendors/mews.js';
import { cloudbedsFlow }       from './vendors/cloudbeds.js';
import { roomRaccoonFlow }     from './vendors/roomraccoon.js';
import { sabeeAppFlow }        from './vendors/sabeeapp.js';
import { ezeeCentrixFlow }     from './vendors/ezee-centrix.js';
// Batch 2
import { axisRoomsFlow }       from './vendors/axisrooms.js';
import { staahFlow }           from './vendors/staah.js';
import { staahV2Flow }         from './vendors/staah-v2.js';
import { verticalBookingFlow } from './vendors/vertical-booking.js';
import { rateGainFlow }        from './vendors/rategain.js';
import { dEdgeFlow }           from './vendors/d-edge.js';
// Batch 3
import { channexFlow }         from './vendors/channex.js';
import { stayFlexiFlow }       from './vendors/stayflexi.js';
import { roomCloudFlow }       from './vendors/roomcloud.js';
import { synxisCcxFlow }       from './vendors/synxis-ccx.js';
import { djuboFlow }           from './vendors/djubo.js';
// Batch 4
import { hotelRunnerFlow }     from './vendors/hotelrunner.js';
import { rateTigerFlow }       from './vendors/ratetiger.js';
import { asiaTechFlow }        from './vendors/asiatech.js';
import { elektraWebFlow }      from './vendors/elektraweb.js';
import { resAvenueFlow }       from './vendors/resavenue.js';
// Batch 5
import { extranetSyncFlow }    from './vendors/extranetsync.js';
import { yieldPlanetFlow }     from './vendors/yieldplanet.js';
import { eGlobeFlow }          from './vendors/eglobe.js';
import { bookingJiniFlow }     from './vendors/bookingjini.js';
import { wuBookFlow }          from './vendors/wubook.js';
// Batch 6
import { dingusFlow }          from './vendors/dingus.js';
import { omnibeesFlow }        from './vendors/omnibees.js';
import { easeRoomFlow }        from './vendors/easeroom.js';
import { hotelPartnerFlow }    from './vendors/hotelpartner.js';
import { reselivaFlow }        from './vendors/reseliva.js';
// Batch 7
import { hotelLinkFlow }       from './vendors/hotel-link.js';
import { optimaFlow }          from './vendors/optima.js';
import { ermesFlow }           from './vendors/ermes.js';
import { maximojoFlow }        from './vendors/maximojo.js';
import { simpleBookingFlow }   from './vendors/simple-booking.js';
// Batch 8
import { aiosellFlow }         from './vendors/aiosell.js';
import { lobbyPmsFlow }        from './vendors/lobbypms.js';
import { bookingExpertFlow }   from './vendors/booking-expert.js';
import { spiderFlow }          from './vendors/spider.js';
import { profitroomFlow }      from './vendors/profitroom.js';

const registry = new Map<number, VendorFlow>([
  [siteMinderFlow.pmsId,      siteMinderFlow],
  [travelClickFlow.pmsId,     travelClickFlow],
  [mewsFlow.pmsId,            mewsFlow],
  [cloudbedsFlow.pmsId,       cloudbedsFlow],
  [roomRaccoonFlow.pmsId,     roomRaccoonFlow],
  [sabeeAppFlow.pmsId,        sabeeAppFlow],
  [ezeeCentrixFlow.pmsId,     ezeeCentrixFlow],
  [axisRoomsFlow.pmsId,       axisRoomsFlow],
  [staahFlow.pmsId,           staahFlow],
  [staahV2Flow.pmsId,         staahV2Flow],
  [verticalBookingFlow.pmsId, verticalBookingFlow],
  [rateGainFlow.pmsId,        rateGainFlow],
  [dEdgeFlow.pmsId,           dEdgeFlow],
  [channexFlow.pmsId,         channexFlow],
  [stayFlexiFlow.pmsId,       stayFlexiFlow],
  [roomCloudFlow.pmsId,       roomCloudFlow],
  [synxisCcxFlow.pmsId,       synxisCcxFlow],
  [djuboFlow.pmsId,           djuboFlow],
  [hotelRunnerFlow.pmsId,     hotelRunnerFlow],
  [rateTigerFlow.pmsId,       rateTigerFlow],
  [asiaTechFlow.pmsId,        asiaTechFlow],
  [elektraWebFlow.pmsId,      elektraWebFlow],
  [resAvenueFlow.pmsId,       resAvenueFlow],
  [extranetSyncFlow.pmsId,    extranetSyncFlow],
  [yieldPlanetFlow.pmsId,     yieldPlanetFlow],
  [eGlobeFlow.pmsId,          eGlobeFlow],
  [bookingJiniFlow.pmsId,     bookingJiniFlow],
  [wuBookFlow.pmsId,          wuBookFlow],
  [dingusFlow.pmsId,          dingusFlow],
  [omnibeesFlow.pmsId,        omnibeesFlow],
  [easeRoomFlow.pmsId,        easeRoomFlow],
  [hotelPartnerFlow.pmsId,    hotelPartnerFlow],
  [reselivaFlow.pmsId,        reselivaFlow],
  [hotelLinkFlow.pmsId,       hotelLinkFlow],
  [optimaFlow.pmsId,          optimaFlow],
  [ermesFlow.pmsId,           ermesFlow],
  [maximojoFlow.pmsId,        maximojoFlow],
  [simpleBookingFlow.pmsId,   simpleBookingFlow],
  [aiosellFlow.pmsId,         aiosellFlow],
  [lobbyPmsFlow.pmsId,        lobbyPmsFlow],
  [bookingExpertFlow.pmsId,   bookingExpertFlow],
  [spiderFlow.pmsId,          spiderFlow],
  [profitroomFlow.pmsId,      profitroomFlow],
]);

for (const flow of registry.values()) {
  validateVendorFlow(flow);
}

export function getVendorFlow(pmsId: number): VendorFlow | undefined {
  return registry.get(pmsId);
}

export function listVendorFlows(): VendorFlow[] {
  return Array.from(registry.values()).sort((a, b) => a.pmsName.localeCompare(b.pmsName));
}
