/**
 * Static data service — transforms HyperGuest raw static data into IBE API shapes.
 */

import type { PropertyDetail, HGPropertyStatic } from '@ibe/shared'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'

export async function getPropertyDetail(propertyId: number): Promise<PropertyDetail> {
  const raw = await fetchPropertyStatic(propertyId)
  return transformPropertyStatic(raw)
}

function transformPropertyStatic(raw: HGPropertyStatic): PropertyDetail {
  return {
    propertyId: raw.id,
    name: raw.name,
    starRating: raw.rating,
    logo: raw.logo,
    descriptions: raw.descriptions.map((d) => ({
      text: d.description,
      locale: normaliseLocale(d.language),
    })),
    images: raw.images
      .sort((a, b) => a.priority - b.priority)
      .map((img) => ({
        id: img.id,
        url: img.uri,
        description: img.description,
        priority: img.priority,
      })),
    facilities: raw.facilities.map((f) => ({
      id: f.id,
      name: f.name,
      nameSlug: f.nameSlug,
      category: f.category,
      classification: f.classification,
      popular: f.popular === 1,
    })),
    rooms: raw.rooms.map((room) => ({
      roomId: room.id,
      roomCode: room.pmsCode,
      name: room.name,
      descriptions: room.descriptions.map((d) => ({
        text: d.description,
        locale: normaliseLocale(d.language),
      })),
      facilities: room.facilities.map((f) => ({
        id: f.id,
        name: f.name,
        nameSlug: f.nameSlug,
        category: f.category,
        classification: f.classification,
        popular: f.popular === 1,
      })),
      images: room.images
        .sort((a, b) => a.priority - b.priority)
        .map((img) => ({
          id: img.id,
          url: img.uri,
          description: img.description,
          priority: img.priority,
        })),
      beds: room.beds.map((b) => ({ type: b.type, quantity: b.quantity })),
    })),
    contact: {
      email: raw.contact.email,
      phone: raw.contact.phone,
      website: raw.contact.website,
    },
    location: {
      address: raw.location.address,
      city: raw.location.city.name,
      countryCode: raw.location.countryCode,
      postcode: raw.location.postcode,
      coordinates: {
        latitude: raw.coordinates.latitude,
        longitude: raw.coordinates.longitude,
      },
    },
  }
}

/** Normalises HyperGuest locale strings (e.g. "en_US") to BCP 47 (e.g. "en"). */
function normaliseLocale(locale: string): string {
  return locale.replace('_', '-').split('-')[0] ?? locale
}
