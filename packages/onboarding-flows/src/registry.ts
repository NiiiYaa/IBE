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
// Batch 9
import { phobsFlow }           from './vendors/phobs.js';
import { todoAlojamientoFlow } from './vendors/todoalojamiento.js';
import { hotelNetSolutionsFlow } from './vendors/hotelnetsolutions.js';
import { hostPmsFlow }         from './vendors/host-pms.js';
import { sistemOtelFlow }      from './vendors/sistemotel.js';
// Batch 10
import { shijiFlow }           from './vendors/shiji.js';
import { miniHotelFlow }       from './vendors/mini-hotel.js';
import { rmsFlow }             from './vendors/rms.js';
import { ispravaFlow }         from './vendors/isprava.js';
import { eResConnectFlow }     from './vendors/eresconnect.js';
// Batch 11
import { busyRoomsFlow }       from './vendors/busy-rooms.js';
import { octoRateFlow }        from './vendors/octorate.js';
import { prestigeFlow }        from './vendors/prestige.js';
import { dirs21Flow }          from './vendors/dirs21.js';
import { passepartoutFlow }    from './vendors/passepartout.js';
// Batch 12
import { hotetecFlow }         from './vendors/hotetec.js';
import { teamSystemFlow }      from './vendors/teamsystem.js';
import { zotelFlow }           from './vendors/zotel.js';
import { bookingDesignerFlow } from './vendors/booking-designer.js';
import { myGuestCareFlow }     from './vendors/myguestcare.js';
// Batch 13
import { staysFlow }           from './vendors/stays.js';
import { hotelConnectFlow }    from './vendors/hotelconnect.js';
import { shrFlow }             from './vendors/shr.js';
import { lighthouseFlow }      from './vendors/lighthouse.js';
import { nextPaxFlow }         from './vendors/nextpax.js';
// Batch 13 (pending registration)
import { aoHostelsFlow }           from './vendors/aohostels.js';
import { bookingHotelFlow }        from './vendors/bookinghotel.js';
import { travellineFlow }          from './vendors/travelline.js';
// Batch 14
import { smarthotelFlow }          from './vendors/smarthotel.js';
import { viomaFlow }               from './vendors/vioma.js';
import { creativetecnoFlow }       from './vendors/creativetecno.js';
import { primalresFlow }           from './vendors/primalres.js';
// Batch 15
import { eviivoFlow }              from './vendors/eviivo.js';
import { booklogicFlow }           from './vendors/booklogic.js';
import { hotelAvailabilitiesFlow } from './vendors/hotelavailabilities.js';
import { ipernetFlow }             from './vendors/ipernet.js';
import { otaSyncFlow }             from './vendors/otasync.js';
// Batch 16
import { egdsFlow }                from './vendors/egds.js';
import { exelyFlow }               from './vendors/exely.js';
import { tisyaStaysFlow }          from './vendors/tisyastays.js';
import { proExSusFlow }            from './vendors/proexsus.js';
import { fnsRoomsFlow }            from './vendors/fnsrooms.js';
import { revenatiumFlow }          from './vendors/revenatium.js';
import { myHotelLineFlow }         from './vendors/myhotelline.js';
import { aviratoFlow }             from './vendors/avirato.js';
import { webBookingProFlow }       from './vendors/webbookingpro.js';
import { bookOnePmsFlow }          from './vendors/bookonepms.js';
import { operaCloudFlow }          from './vendors/operacloud.js';
// Batch 17
import { derbysoftFlow }           from './vendors/derbysoft.js';
import { derbysoftV2Flow }         from './vendors/derbysoft-v2.js';

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
  [phobsFlow.pmsId,           phobsFlow],
  [todoAlojamientoFlow.pmsId, todoAlojamientoFlow],
  [hotelNetSolutionsFlow.pmsId, hotelNetSolutionsFlow],
  [hostPmsFlow.pmsId,         hostPmsFlow],
  [sistemOtelFlow.pmsId,      sistemOtelFlow],
  [shijiFlow.pmsId,           shijiFlow],
  [miniHotelFlow.pmsId,       miniHotelFlow],
  [rmsFlow.pmsId,             rmsFlow],
  [ispravaFlow.pmsId,         ispravaFlow],
  [eResConnectFlow.pmsId,     eResConnectFlow],
  [busyRoomsFlow.pmsId,       busyRoomsFlow],
  [octoRateFlow.pmsId,        octoRateFlow],
  [prestigeFlow.pmsId,        prestigeFlow],
  [dirs21Flow.pmsId,          dirs21Flow],
  [passepartoutFlow.pmsId,    passepartoutFlow],
  [hotetecFlow.pmsId,         hotetecFlow],
  [teamSystemFlow.pmsId,      teamSystemFlow],
  [zotelFlow.pmsId,           zotelFlow],
  [bookingDesignerFlow.pmsId, bookingDesignerFlow],
  [myGuestCareFlow.pmsId,     myGuestCareFlow],
  [staysFlow.pmsId,           staysFlow],
  [hotelConnectFlow.pmsId,    hotelConnectFlow],
  [shrFlow.pmsId,             shrFlow],
  [lighthouseFlow.pmsId,      lighthouseFlow],
  [nextPaxFlow.pmsId,         nextPaxFlow],
  [aoHostelsFlow.pmsId,       aoHostelsFlow],
  [bookingHotelFlow.pmsId,    bookingHotelFlow],
  [travellineFlow.pmsId,      travellineFlow],
  [smarthotelFlow.pmsId,      smarthotelFlow],
  [viomaFlow.pmsId,                viomaFlow],
  [creativetecnoFlow.pmsId,        creativetecnoFlow],
  [primalresFlow.pmsId,            primalresFlow],
  [eviivoFlow.pmsId,               eviivoFlow],
  [booklogicFlow.pmsId,            booklogicFlow],
  [hotelAvailabilitiesFlow.pmsId,  hotelAvailabilitiesFlow],
  [ipernetFlow.pmsId,              ipernetFlow],
  [otaSyncFlow.pmsId,              otaSyncFlow],
  [egdsFlow.pmsId,                 egdsFlow],
  [exelyFlow.pmsId,                exelyFlow],
  [tisyaStaysFlow.pmsId,           tisyaStaysFlow],
  [proExSusFlow.pmsId,             proExSusFlow],
  [fnsRoomsFlow.pmsId,             fnsRoomsFlow],
  [revenatiumFlow.pmsId,           revenatiumFlow],
  [myHotelLineFlow.pmsId,          myHotelLineFlow],
  [aviratoFlow.pmsId,              aviratoFlow],
  [webBookingProFlow.pmsId,        webBookingProFlow],
  [bookOnePmsFlow.pmsId,           bookOnePmsFlow],
  [operaCloudFlow.pmsId,           operaCloudFlow],
  [derbysoftFlow.pmsId,            derbysoftFlow],
  [derbysoftV2Flow.pmsId,          derbysoftV2Flow],
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
