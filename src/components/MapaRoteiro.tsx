import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { Coordenada } from '../utils/rota';

export interface PontoRoteiro extends Coordenada {
  /** Número da parada na trajetória (1, 2, 3...) — é o que aparece dentro do marcador. */
  ordem: number;
  rotulo: string;
}

interface MapaRoteiroProps {
  pontos: PontoRoteiro[];
  /** Localização atual, quando disponível — vira o marcador de partida. */
  origem?: Coordenada | null;
  altura?: number;
}

/**
 * Mapa das paradas do roteiro, na ordem definida pelo usuário.
 *
 * Usa Leaflet + tiles do OpenStreetMap dentro de um WebView em vez de react-native-maps: o
 * WebView já vem no app (react-native-webview) e o OSM não exige chave de API nem build nativo
 * novo, que o Google Maps exigiria. Precisa de internet só pros tiles.
 */
export function MapaRoteiro({ pontos, origem, altura = 220 }: MapaRoteiroProps) {
  const html = useMemo(() => montarHtml(pontos, origem ?? null), [pontos, origem]);

  return (
    <View style={[styles.container, { height: altura }]}>
      <WebView
        style={styles.webview}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        // O mapa é só leitura: sem barra de scroll própria e sem zoom por duplo toque do WebView,
        // pra não brigar com o scroll da lista de processos por baixo.
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      />
    </View>
  );
}

function montarHtml(pontos: PontoRoteiro[], origem: Coordenada | null): string {
  const dados = JSON.stringify({
    pontos: pontos.map((p) => ({ lat: p.latitude, lng: p.longitude, ordem: p.ordem, rotulo: p.rotulo })),
    origem: origem ? { lat: origem.latitude, lng: origem.longitude } : null,
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #mapa { margin: 0; padding: 0; height: 100%; width: 100%; background: #eef2f5; }
    .parada {
      background: #1c3d5a; color: #fff; border: 2px solid #fff; border-radius: 50%;
      width: 26px; height: 26px; line-height: 22px; text-align: center;
      font: 700 13px -apple-system, Roboto, sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.4);
    }
    .partida { background: #2a9d5c; }
    .aviso {
      display: flex; align-items: center; justify-content: center; height: 100%;
      color: #8a97a3; font: 13px -apple-system, Roboto, sans-serif; text-align: center; padding: 0 24px;
    }
  </style>
</head>
<body>
  <div id="mapa"></div>
  <script>
    var dados = ${dados};

    function icone(texto, extraClasse) {
      return L.divIcon({
        className: '',
        html: '<div class="parada ' + extraClasse + '">' + texto + '</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
    }

    if (!window.L) {
      document.getElementById('mapa').innerHTML =
        '<div class="aviso">Não foi possível carregar o mapa. Verifique a conexão com a internet.</div>';
    } else if (dados.pontos.length === 0 && !dados.origem) {
      document.getElementById('mapa').innerHTML =
        '<div class="aviso">Selecione processos para ver as paradas no mapa.</div>';
    } else {
      var mapa = L.map('mapa', { zoomControl: false, attributionControl: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapa);

      var coords = [];

      if (dados.origem) {
        var p = [dados.origem.lat, dados.origem.lng];
        coords.push(p);
        L.marker(p, { icon: icone('&#9679;', 'partida') }).addTo(mapa).bindPopup('Sua localização');
      }

      dados.pontos.forEach(function (ponto) {
        var p = [ponto.lat, ponto.lng];
        coords.push(p);
        L.marker(p, { icon: icone(ponto.ordem, '') }).addTo(mapa).bindPopup(ponto.rotulo);
      });

      if (coords.length > 1) {
        L.polyline(coords, { color: '#1c3d5a', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(mapa);
        mapa.fitBounds(L.latLngBounds(coords), { padding: [32, 32] });
      } else {
        mapa.setView(coords[0], 14);
      }
    }
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e3e8ed',
    marginBottom: 14,
    backgroundColor: '#eef2f5',
  },
  webview: {
    flex: 1,
    backgroundColor: '#eef2f5',
  },
});
