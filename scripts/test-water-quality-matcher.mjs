import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBeachName,
  haversineMeters,
  findApaMatch,
} from './lib/water-quality-matcher.mjs';

// ── normalizeBeachName ────────────────────────────────────────────────────
test('normalizeBeachName remove acentos e baixa caixa', () => {
  assert.equal(normalizeBeachName('Praia Fluvial de Alqueva'), 'alqueva');
  assert.equal(normalizeBeachName('Açude do Pinto'), 'acude pinto');
});

test('normalizeBeachName remove prefixos "Praia Fluvial", "Zona Balnear", "Parque Fluvial", "Areal"', () => {
  assert.equal(normalizeBeachName('Praia Fluvial das Rocas'), 'rocas');
  assert.equal(normalizeBeachName('Zona Balnear de Melres'), 'melres');
  assert.equal(normalizeBeachName('Parque Fluvial do Alfusqueiro'), 'alfusqueiro');
  assert.equal(normalizeBeachName('Areal de Zebreiros'), 'zebreiros');
});

test('normalizeBeachName remove "Albufeira da/de/do"', () => {
  assert.equal(normalizeBeachName('Albufeira do Caldeirão'), 'caldeirao');
  assert.equal(normalizeBeachName('Praia Fluvial da Albufeira da Queimadela'), 'queimadela');
});

test('normalizeBeachName colapsa espaços e remove pontuação', () => {
  assert.equal(normalizeBeachName('  Pego   Fundo!! '), 'pego fundo');
  assert.equal(normalizeBeachName("Azenhas d'El Rei"), 'azenhas d el rei');
});

// ── haversineMeters ────────────────────────────────────────────────────────
test('haversineMeters retorna 0 para o mesmo ponto', () => {
  assert.equal(haversineMeters(38.21, -7.52, 38.21, -7.52), 0);
});

test('haversineMeters dá distância plausível entre Lisboa e Porto', () => {
  const d = haversineMeters(38.7223, -9.1393, 41.1579, -8.6291);
  // ~273 km
  assert.ok(d > 270000 && d < 280000, `esperado ~273000m, recebido ${d}`);
});

// ── findApaMatch ───────────────────────────────────────────────────────────
const apaSample = [
  {
    profile: { codigo_agua_balnear: 'PTCD9W', praia: 'Praia Fluvial de Alqueva', latitude: 38.21112, longitude: -7.5222, interior: 1, costeira: 0 },
    quality: {},
  },
  {
    profile: { codigo_agua_balnear: 'PTCQ7M', praia: 'Praia Fluvial de Monsaraz', latitude: 38.434643, longitude: -7.350832, interior: 1, costeira: 0 },
    quality: {},
  },
  {
    profile: { codigo_agua_balnear: 'PTCQ4X', praia: 'Pedras Ruivas', latitude: 41.85, longitude: -8.85, interior: 0, costeira: 1 },
    quality: {},
  },
  {
    profile: { codigo_agua_balnear: 'PTCV2A', praia: 'Vau', latitude: 37.10, longitude: -8.55, interior: 0, costeira: 1 },
    quality: {},
  },
];

test('findApaMatch sinal 1: override manual via apaCode', () => {
  const site = { name: 'Coisa qualquer', apaCode: 'PTCQ7M', coordinates: { lat: 0, lng: 0 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m.matched.profile.codigo_agua_balnear, 'PTCQ7M');
  assert.equal(m.matchMethod, 'manual');
});

test('findApaMatch sinal 1: apaCode inválido devolve sem match', () => {
  const site = { name: 'X', apaCode: 'PT-INEXISTENTE', coordinates: { lat: 0, lng: 0 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m, null);
});

test('findApaMatch sinal 2: proximidade ≤ 800m sem nome igual', () => {
  // ~50m de Alqueva (38.21112, -7.5222), nome muito diferente
  const site = { name: 'Areal Junto', coordinates: { lat: 38.21157, lng: -7.5222 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m.matched.profile.codigo_agua_balnear, 'PTCD9W');
  assert.equal(m.matchMethod, 'proximity');
  assert.ok(m.matchDistance < 800);
});

test('findApaMatch sinal 3: nome igual + proximidade ≤ 5km (catch costeira river-mouth)', () => {
  // "Pedras Ruivas" do site a 750m da APA costeira "Pedras Ruivas"
  const site = { name: 'Praia Fluvial das Pedras Ruivas', coordinates: { lat: 41.8567, lng: -8.85 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m.matched.profile.codigo_agua_balnear, 'PTCQ4X');
  assert.equal(m.matchMethod, 'name+proximity');
  assert.equal(m.matchPool, 'costeira');
});

test('findApaMatch rejeita falso positivo: mesmo nome a > 5km', () => {
  // Vau (Algarve) tem o mesmo nome mas está a centenas de km
  const site = { name: 'Zona Balnear de Vau', coordinates: { lat: 41.0, lng: -8.5 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m, null);
});

test('findApaMatch sem qualquer sinal devolve null', () => {
  const site = { name: 'Praia Inventada', coordinates: { lat: 50.0, lng: 5.0 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m, null);
});

test('findApaMatch retorna matchPool correctamente para interior', () => {
  const site = { name: 'Praia Fluvial de Alqueva', coordinates: { lat: 38.21112, lng: -7.5222 } };
  const m = findApaMatch(site, apaSample);
  assert.equal(m.matchPool, 'interior');
});
