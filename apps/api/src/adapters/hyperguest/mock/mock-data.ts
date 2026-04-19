/**
 * Realistic mock data for property 19912 (HyperGuest certification property).
 * Used in mock/dev mode — no real API credentials needed.
 */

import type { HGPropertyStatic, HGSearchResponse } from '@ibe/shared'
import { BoardType, CancellationPenaltyType, ChargeParty, ChargeType, TaxRelation } from '@ibe/shared'

export const MOCK_PROPERTY_ID = 19912

export const MOCK_PROPERTY_STATIC: HGPropertyStatic = {
  id: MOCK_PROPERTY_ID,
  name: 'The Grand Certification Hotel',
  rating: 4,
  logo: 'https://hg-static.s3.eu-central-1.amazonaws.com/19912/images/image_1750950_original.jpg',
  group: '',
  isTest: 1,
  contact: {
    email: 'info@grandcertification.com',
    phone: '+1-555-0100',
    website: 'https://grandcertification.com',
  },
  coordinates: { latitude: 42.1107, longitude: -72.596 },
  location: {
    address: '256 Pearl Street, Springfield, MA 01103',
    city: { id: 9656, name: 'Springfield', hereMapsId: 'Springfield, MA' },
    countryCode: 'US',
    postcode: '01103',
    region: 'Massachusetts',
  },
  descriptions: [
    {
      language: 'en_US',
      type: 'general',
      description:
        'A stunning four-star property in the heart of Springfield. Enjoy spacious rooms, an outdoor pool, and a rooftop restaurant — all just steps from the city\'s top attractions.',
    },
  ],
  facilities: [
    { id: 15, name: 'Nightclub/DJ', category: 'Electronics & Entertainment', categorySlug: 'electronics-entertainment', classification: 'Amenity', popular: 0, type: 'hotel' },
    { id: 16, name: 'Outdoor pool', category: 'Wellness', categorySlug: 'wellness', classification: 'Amenity', popular: 1, type: 'hotel' },
    { id: 17, name: 'Restaurant', category: 'Food & Drink', categorySlug: 'food-drink', classification: 'Service', popular: 1, type: 'hotel' },
    { id: 18, name: 'Room service', category: 'Food & Drink', categorySlug: 'food-drink', classification: 'Service', popular: 0, type: 'hotel' },
    { id: 20, name: 'Free Wi-Fi', category: 'Connectivity', categorySlug: 'connectivity', classification: 'Amenity', popular: 1, type: 'hotel' },
    { id: 21, name: 'Parking', category: 'Transport', categorySlug: 'transport', classification: 'Service', popular: 1, type: 'hotel' },
    { id: 22, name: 'Fitness centre', category: 'Wellness', categorySlug: 'wellness', classification: 'Amenity', popular: 1, type: 'hotel' },
    { id: 23, name: 'Spa', category: 'Wellness', categorySlug: 'wellness', classification: 'Service', popular: 1, type: 'hotel' },
  ],
  images: [
    { id: 1813791, uri: 'https://hg-static.hyperguest.com/19912/images/image_1813791_original.jpg', description: 'Hotel exterior', priority: 0, type: 'photo', size: { width: 500, height: 636 }, tags: [], created: '2022-01-07T22:03:43.000Z', updated: '2022-01-07T22:08:47.000Z' },
    { id: 1813792, uri: 'https://hg-static.hyperguest.com/19912/images/image_1813792_original.jpg', description: 'Lobby', priority: 50, type: 'photo', size: { width: 500, height: 370 }, tags: [], created: '2022-01-07T22:03:43.000Z', updated: '2022-01-07T22:03:43.000Z' },
    { id: 1813793, uri: 'https://hg-static.hyperguest.com/19912/images/image_1813793_original.jpg', description: 'Pool area', priority: 50, type: 'photo', size: { width: 500, height: 282 }, tags: [], created: '2022-01-07T22:03:43.000Z', updated: '2022-01-07T22:03:43.000Z' },
  ],
  policies: [
    {
      id: 122751, name: 'Cancellation', type: 'cancellation',
      condition: {}, dates: { start: null, end: null }, extraData: null,
      result: [
        { Days_Before: 3, Penalty_Type: 'percent', Penalty_Value: '100', Time_Before_Check_In: 3, Time_Before_Check_In_Type: 'days' },
      ],
    },
    {
      id: 152948, name: 'General', type: 'general',
      condition: {}, dates: { start: null, end: null }, extraData: null,
      result: { Title: 'Important notice', Description: 'This is a demonstration property for the IBE booking engine. No actual reservations will be made.' },
    },
  ],
  ratePlans: [
    {
      id: 19080, pmsCode: 'BAR', name: 'Best Available Rate', description: 'Our best public rate — flexible and cancellable.',
      isBar: true, isPrivate: false, baseRateplanId: null, baseRatePlanPmsCode: '',
      policies: [], tags: [],
      settings: { board: { code: BoardType.BedAndBreakfast, description: 'Breakfast included' }, charge: ChargeParty.Customer, priceType: ChargeType.Net, status: null },
    },
    {
      id: 26340, pmsCode: 'NRF', name: 'Non-Refundable', description: 'Lowest price, non-refundable.',
      isBar: false, isPrivate: false, baseRateplanId: 19080, baseRatePlanPmsCode: 'BAR',
      policies: [], tags: [],
      settings: { board: { code: BoardType.RoomOnly, description: 'Room only' }, charge: ChargeParty.Agent, priceType: ChargeType.Sell, status: null },
    },
  ],
  rooms: [
    {
      id: 31446, hotelId: MOCK_PROPERTY_ID, pmsCode: 'STD', name: 'Standard Room',
      descriptions: [{ description: 'A comfortable standard room with city views, king-size bed, and all modern amenities.', language: 'en_US', roomId: 31446 }],
      facilities: [
        { id: 2001, name: 'Accessible by Lift', category: 'Accessibility', categorySlug: 'accessibility', classification: 'Amenity', popular: 0, type: 'room' },
        { id: 2014, name: 'Bathroom', category: 'Bathroom', categorySlug: 'bathroom', classification: 'Amenity', popular: 0, type: 'room' },
        { id: 2020, name: 'Air conditioning', category: 'Climate', categorySlug: 'climate', classification: 'Amenity', popular: 1, type: 'room' },
        { id: 2030, name: 'Flat-screen TV', category: 'Entertainment', categorySlug: 'entertainment', classification: 'Amenity', popular: 1, type: 'room' },
        { id: 2040, name: 'Safe', category: 'General', categorySlug: 'general', classification: 'Amenity', popular: 0, type: 'room' },
      ],
      images: [
        { id: 1813798, uri: 'https://hg-static.hyperguest.com/19912/images/image_1813798_original.jpg', description: 'Standard Room', priority: 50, type: 'photo', size: { width: 500, height: 334 }, tags: [], created: '2022-01-07T22:07:19.000Z', updated: '2022-01-07T22:07:19.000Z' },
        { id: 1813799, uri: 'https://hg-static.hyperguest.com/19912/images/image_1813799_original.jpg', description: 'Bathroom', priority: 50, type: 'photo', size: { width: 500, height: 334 }, tags: [], created: '2022-01-07T22:07:49.000Z', updated: '2022-01-07T22:07:49.000Z' },
      ],
      beds: [{ type: 'King', size: 180, quantity: 1 }],
      ratePlans: [],
    },
    {
      id: 31447, hotelId: MOCK_PROPERTY_ID, pmsCode: 'DLX', name: 'Deluxe Room',
      descriptions: [{ description: 'Spacious deluxe room with panoramic views, king-size bed, and premium minibar.', language: 'en_US', roomId: 31447 }],
      facilities: [
        { id: 2020, name: 'Air conditioning', category: 'Climate', categorySlug: 'climate', classification: 'Amenity', popular: 1, type: 'room' },
        { id: 2030, name: 'Flat-screen TV', category: 'Entertainment', categorySlug: 'entertainment', classification: 'Amenity', popular: 1, type: 'room' },
        { id: 2071, name: 'Hot Tub', category: 'Wellness', categorySlug: 'wellness', classification: 'Amenity', popular: 0, type: 'room' },
        { id: 2050, name: 'Minibar', category: 'Food & Drink', categorySlug: 'food-drink', classification: 'Amenity', popular: 1, type: 'room' },
      ],
      images: [
        { id: 1813800, uri: 'https://hg-static.hyperguest.com/19912/images/image_1813800_original.jpg', description: 'Deluxe Room', priority: 50, type: 'photo', size: { width: 500, height: 335 }, tags: [], created: '2022-01-07T22:07:49.000Z', updated: '2022-01-07T22:07:49.000Z' },
      ],
      beds: [{ type: 'King', size: 200, quantity: 1 }],
      ratePlans: [],
    },
  ],
  commission: { calculation: 'without_fees_with_taxes', chargeType: 'percent', value: 10 },
  created: '2021-01-28 08:06:34',
}

/**
 * Builds a mock search response for the given check-in, nights and guests.
 * Prices vary slightly based on check-in date to feel realistic.
 */
export function buildMockSearchResponse(
  checkIn: string,
  nights: number,
  guestsParam: string,
): HGSearchResponse {
  // Simple price variation based on check-in month
  const month = parseInt(checkIn.split('-')[1] ?? '1', 10)
  const seasonMultiplier = month >= 6 && month <= 8 ? 1.4 : month >= 12 || month <= 2 ? 0.8 : 1.0

  const stdNetPerNight = Math.round(120 * seasonMultiplier)
  const stdSellPerNight = Math.round(150 * seasonMultiplier)
  const dlxNetPerNight = Math.round(180 * seasonMultiplier)
  const dlxSellPerNight = Math.round(220 * seasonMultiplier)

  const stdNetTotal = stdNetPerNight * nights
  const stdSellTotal = stdSellPerNight * nights
  const dlxNetTotal = dlxNetPerNight * nights
  const dlxSellTotal = dlxSellPerNight * nights

  // Build nightly breakdown for check-in date
  const nightlyBreakdownStd = Array.from({ length: nights }, (_, i) => {
    const d = new Date(checkIn)
    d.setDate(d.getDate() + i)
    const date = d.toISOString().slice(0, 10)
    return {
      date,
      prices: {
        net: { price: stdNetPerNight, currency: 'EUR', taxes: [] },
        sell: { price: stdSellPerNight, currency: 'EUR', taxes: [] },
        commission: { price: Math.round(stdSellPerNight * 0.1), currency: 'EUR' },
        bar: { price: stdSellPerNight, currency: 'EUR' },
        fees: [],
      },
    }
  })

  const nightlyBreakdownDlx = Array.from({ length: nights }, (_, i) => {
    const d = new Date(checkIn)
    d.setDate(d.getDate() + i)
    const date = d.toISOString().slice(0, 10)
    return {
      date,
      prices: {
        net: { price: dlxNetPerNight, currency: 'EUR', taxes: [] },
        sell: { price: dlxSellPerNight, currency: 'EUR', taxes: [] },
        commission: { price: Math.round(dlxSellPerNight * 0.1), currency: 'EUR' },
        bar: { price: dlxSellPerNight, currency: 'EUR' },
        fees: [],
      },
    }
  })

  return {
    results: [
      {
        propertyId: MOCK_PROPERTY_ID,
        propertyInfo: {
          name: 'The Grand Certification Hotel',
          starRating: 4,
          cityName: 'Springfield',
          cityId: 9656,
          countryName: 'United States',
          countryCode: 'US',
          regionName: 'Massachusetts',
          regionCode: 'MA',
          longitude: -72.596,
          latitude: 42.1107,
          propertyType: 11,
          propertyTypeName: 'Hotel',
        },
        remarks: [
          'This is a demonstration booking engine. No real charges will be made.',
        ],
        rooms: [
          {
            searchedPax: { adults: 2, children: [] },
            roomId: 31446,
            roomTypeCode: 'STD',
            roomName: 'Standard Room',
            numberOfAvailableRooms: 5,
            settings: {
              numberOfBedrooms: 1, roomSize: 28, maxAdultsNumber: 2,
              maxChildrenNumber: 1, maxInfantsNumber: 0, maxOccupancy: 3,
              numberOfBeds: 1, beddingConfigurations: [{ type: 'King', size: 180, quantity: 1 }],
            },
            ratePlans: [
              {
                ratePlanCode: 'BAR',
                ratePlanId: 19080,
                ratePlanName: 'Best Available Rate',
                ratePlanInfo: { virtual: false, contracts: [], originalRatePlanCode: '', isPromotion: false, isPackageRate: false, isPrivate: false },
                board: BoardType.BedAndBreakfast,
                remarks: ['Breakfast served daily 07:00–10:30 in the main restaurant.'],
                cancellationPolicies: [
                  {
                    daysBefore: 1,
                    penaltyType: CancellationPenaltyType.Nights,
                    amount: 0,
                    timeSetting: { timeFromCheckIn: 48, timeFromCheckInType: 'hours' },
                    cancellationDeadlineHour: '14:00',
                  },
                ],
                payment: {
                  charge: ChargeParty.Customer,
                  chargeType: ChargeType.Net,
                  chargeAmount: { price: stdNetTotal, currency: 'EUR' },
                },
                prices: {
                  net: { price: stdNetTotal, currency: 'EUR', taxes: [{ description: 'City Tax 3€/person/night', amount: nights * 2 * 3, currency: 'EUR', relation: TaxRelation.Display }] },
                  sell: { price: stdSellTotal, currency: 'EUR', taxes: [] },
                  commission: { price: Math.round(stdSellTotal * 0.1), currency: 'EUR' },
                  bar: { price: stdSellTotal, currency: 'EUR' },
                  fees: [{ description: 'City Tax 3€/person/night (paid at hotel)', amount: nights * 2 * 3, currency: 'EUR', relation: TaxRelation.Display }],
                },
                nightlyBreakdown: nightlyBreakdownStd,
                isImmediate: true,
              },
              {
                ratePlanCode: 'NRF',
                ratePlanId: 26340,
                ratePlanName: 'Non-Refundable',
                ratePlanInfo: { virtual: false, contracts: [], originalRatePlanCode: 'BAR', isPromotion: false, isPackageRate: false, isPrivate: false },
                board: BoardType.RoomOnly,
                remarks: ['Non-refundable. No cancellations or modifications allowed.'],
                cancellationPolicies: [
                  {
                    daysBefore: 999,
                    penaltyType: CancellationPenaltyType.Percent,
                    amount: 100,
                    timeSetting: { timeFromCheckIn: 999, timeFromCheckInType: 'days' },
                    cancellationDeadlineHour: '00:00',
                  },
                ],
                payment: {
                  charge: ChargeParty.Agent,
                  chargeType: ChargeType.Sell,
                  chargeAmount: { price: Math.round(stdSellTotal * 0.85), currency: 'EUR' },
                },
                prices: {
                  net: { price: Math.round(stdNetTotal * 0.85), currency: 'EUR', taxes: [] },
                  sell: { price: Math.round(stdSellTotal * 0.85), currency: 'EUR', taxes: [] },
                  commission: { price: Math.round(stdSellTotal * 0.085), currency: 'EUR' },
                  bar: { price: Math.round(stdSellTotal * 0.85), currency: 'EUR' },
                  fees: [],
                },
                nightlyBreakdown: nightlyBreakdownStd.map(n => ({
                  ...n,
                  prices: {
                    ...n.prices,
                    net: { price: Math.round(stdNetPerNight * 0.85), currency: 'EUR', taxes: [] },
                    sell: { price: Math.round(stdSellPerNight * 0.85), currency: 'EUR', taxes: [] },
                  },
                })),
                isImmediate: true,
              },
            ],
          },
          {
            searchedPax: { adults: 2, children: [] },
            roomId: 31447,
            roomTypeCode: 'DLX',
            roomName: 'Deluxe Room',
            numberOfAvailableRooms: 3,
            settings: {
              numberOfBedrooms: 1, roomSize: 42, maxAdultsNumber: 2,
              maxChildrenNumber: 2, maxInfantsNumber: 1, maxOccupancy: 4,
              numberOfBeds: 1, beddingConfigurations: [{ type: 'King', size: 200, quantity: 1 }],
            },
            ratePlans: [
              {
                ratePlanCode: 'BAR',
                ratePlanId: 19080,
                ratePlanName: 'Best Available Rate',
                ratePlanInfo: { virtual: false, contracts: [], originalRatePlanCode: '', isPromotion: false, isPackageRate: false, isPrivate: false },
                board: BoardType.BedAndBreakfast,
                remarks: ['Breakfast included. Late check-out available on request.'],
                cancellationPolicies: [
                  {
                    daysBefore: 1,
                    penaltyType: CancellationPenaltyType.Nights,
                    amount: 0,
                    timeSetting: { timeFromCheckIn: 48, timeFromCheckInType: 'hours' },
                    cancellationDeadlineHour: '14:00',
                  },
                ],
                payment: {
                  charge: ChargeParty.Customer,
                  chargeType: ChargeType.Net,
                  chargeAmount: { price: dlxNetTotal, currency: 'EUR' },
                },
                prices: {
                  net: { price: dlxNetTotal, currency: 'EUR', taxes: [] },
                  sell: { price: dlxSellTotal, currency: 'EUR', taxes: [] },
                  commission: { price: Math.round(dlxSellTotal * 0.1), currency: 'EUR' },
                  bar: { price: dlxSellTotal, currency: 'EUR' },
                  fees: [{ description: 'City Tax 3€/person/night (paid at hotel)', amount: nights * 2 * 3, currency: 'EUR', relation: TaxRelation.Display }],
                },
                nightlyBreakdown: nightlyBreakdownDlx,
                isImmediate: true,
              },
            ],
          },
        ],
      },
    ],
  }
}
