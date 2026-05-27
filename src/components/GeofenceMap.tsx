/**
 * GeofenceMap — 지오펜싱 시각화 위젯
 *
 *  · VITE_KAKAO_MAP_KEY 설정 시: 실제 카카오맵 (핀 드래그 + 반경 원 + 주소검색)
 *  · 키 미설정 시: SVG mock 지도로 폴백 (외부 API 없이 동작 — 개발/데모)
 *  · 우측 컨트롤(반경/GPS오차/위치정책/현장밖정책)은 공통.
 *
 *  Props 인터페이스는 동일 — 호출부 변경 불필요.
 */

import { useId, useEffect, useRef, useState } from 'react';
import type {
  SiteGeofence,
  LocationRequirement,
  OutOfBoundsPolicy,
} from '../api/site.types';
import './GeofenceMap.css';

interface Props {
  value: SiteGeofence;
  onChange: (next: SiteGeofence) => void;
  /** 현장 주소 (지도 헤더 표시용 + 주소검색) */
  address?: string;
  /** 읽기 전용 (수정 권한 없음) */
  readOnly?: boolean;
}

const MAP_W = 320;
const MAP_H = 220;
const PX_PER_M = 0.6;

/** Vite 환경변수 — 카카오 JavaScript 키 */
const KAKAO_KEY = (import.meta as any).env?.VITE_KAKAO_MAP_KEY as string | undefined;

// ─────────────────────────────────────────────────────────────
// 카카오 SDK 로더 (싱글턴)
// ─────────────────────────────────────────────────────────────
let kakaoLoadPromise: Promise<any> | null = null;
function loadKakao(appKey: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.kakao && w.kakao.maps) return Promise.resolve(w.kakao);
  if (kakaoLoadPromise) return kakaoLoadPromise;
  kakaoLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => {
      try {
        w.kakao.maps.load(() => resolve(w.kakao));
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error('kakao sdk load fail'));
    document.head.appendChild(script);
  });
  return kakaoLoadPromise;
}

export function GeofenceMap({ value, onChange, address, readOnly = false }: Props) {
  function patch<K extends keyof SiteGeofence>(k: K, v: SiteGeofence[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="geofence">
      <div className="geofence__head">
        <span className="geofence__title">📍 출퇴근 정책 (지오펜싱)</span>
        {address && <span className="geofence__addr">{address}</span>}
      </div>

      <div className="geofence__body">
        {/* ── 좌측: 지도 (카카오 or SVG 폴백) ── */}
        {KAKAO_KEY
          ? <KakaoMapPanel value={value} onChange={onChange} address={address} readOnly={readOnly} appKey={KAKAO_KEY} />
          : <MockMapPanel value={value} onChange={onChange} readOnly={readOnly} />}

        {/* ── 우측: 컨트롤 (공통) ── */}
        <div className="geofence__controls">
          <label className="geofence__field">
            <span className="geofence__label">
              인증 반경
              <strong className="geofence__value">{value.radiusM}m</strong>
            </span>
            <input
              type="range" min={20} max={500} step={10}
              value={value.radiusM}
              onChange={(e) => patch('radiusM', Number(e.target.value))}
              disabled={readOnly}
            />
            <span className="geofence__hint">현장 좌표를 중심으로 한 인증 가능 거리</span>
          </label>

          <label className="geofence__field">
            <span className="geofence__label">
              GPS 오차 허용
              <strong className="geofence__value">±{value.gpsTolerance}m</strong>
            </span>
            <input
              type="range" min={10} max={100} step={5}
              value={value.gpsTolerance}
              onChange={(e) => patch('gpsTolerance', Number(e.target.value))}
              disabled={readOnly}
            />
            <span className="geofence__hint">측정 정확도가 이보다 크면 「LOW_ACCURACY」</span>
          </label>

          <div className="geofence__field">
            <span className="geofence__label">위치정보 수집</span>
            <div className="geofence__chips">
              {(
                [
                  ['REQUIRED', '필수', '위치 없으면 인증 거부'],
                  ['RECOMMENDED', '권장', '없어도 인증 허용 (경고만)'],
                  ['OPTIONAL', '선택', 'GPS 위치 미수집 허용'],
                ] as Array<[LocationRequirement, string, string]>
              ).map(([k, label, hint]) => (
                <button
                  key={k}
                  type="button"
                  className={'geofence__chip' + (value.locationRequired === k ? ' is-active' : '')}
                  onClick={() => patch('locationRequired', k)}
                  disabled={readOnly}
                  title={hint}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="geofence__field">
            <span className="geofence__label">현장 밖 출근 시도</span>
            <div className="geofence__chips">
              {(
                [
                  ['BLOCK', '🚫 차단', '반경 밖이면 인증 거부'],
                  ['WARN', '⚠ 경고', '인증은 허용, 표시만 ⚠'],
                  ['ALLOW', '✓ 허용', '제한 없음'],
                ] as Array<[OutOfBoundsPolicy, string, string]>
              ).map(([k, label, hint]) => (
                <button
                  key={k}
                  type="button"
                  className={'geofence__chip' + (value.outOfBoundsPolicy === k ? ' is-active' : '')}
                  onClick={() => patch('outOfBoundsPolicy', k)}
                  disabled={readOnly}
                  title={hint}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 카카오맵 패널
// ─────────────────────────────────────────────────────────────
function KakaoMapPanel({
  value, onChange, address, readOnly, appKey,
}: Props & { appKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let cancelled = false;
    loadKakao(appKey)
      .then((kakao) => {
        if (cancelled || !ref.current) return;
        const center = new kakao.maps.LatLng(valueRef.current.lat, valueRef.current.lng);
        const map = new kakao.maps.Map(ref.current, { center, level: 4 });
        const marker = new kakao.maps.Marker({ position: center, draggable: !readOnly, map });
        const circle = new kakao.maps.Circle({
          center,
          radius: valueRef.current.radiusM,
          strokeWeight: 2,
          strokeColor: '#0f766e',
          strokeOpacity: 0.9,
          strokeStyle: 'dashed',
          fillColor: '#0f766e',
          fillOpacity: 0.15,
        });
        circle.setMap(map);
        mapRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
        setStatus('ready');

        if (!readOnly) {
          const apply = (p: any) => {
            circle.setPosition(p);
            onChangeRef.current({
              ...valueRef.current,
              lat: Number(p.getLat().toFixed(6)),
              lng: Number(p.getLng().toFixed(6)),
            });
          };
          kakao.maps.event.addListener(marker, 'dragend', () => apply(marker.getPosition()));
          kakao.maps.event.addListener(map, 'click', (e: any) => {
            marker.setPosition(e.latLng);
            apply(e.latLng);
          });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [appKey, readOnly]);

  useEffect(() => {
    circleRef.current?.setRadius(value.radiusM);
  }, [value.radiusM]);

  useEffect(() => {
    const kakao = (window as any).kakao;
    if (!kakao || !mapRef.current) return;
    const pos = new kakao.maps.LatLng(value.lat, value.lng);
    markerRef.current?.setPosition(pos);
    circleRef.current?.setPosition(pos);
    mapRef.current.setCenter(pos);
  }, [value.lat, value.lng]);

  function searchAddress() {
    const kakao = (window as any).kakao;
    if (!kakao?.maps?.services || !address) return;
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, (result: any[], st: string) => {
      if (st === kakao.maps.services.Status.OK && result[0]) {
        onChangeRef.current({
          ...valueRef.current,
          lat: Number(Number(result[0].y).toFixed(6)),
          lng: Number(Number(result[0].x).toFixed(6)),
        });
      } else {
        alert('주소를 찾지 못했습니다. 핀을 직접 이동해 주세요.');
      }
    });
  }

  return (
    <div className="geofence__map-wrap">
      <div
        ref={ref}
        style={{ width: '100%', height: MAP_H, borderRadius: 8, overflow: 'hidden', background: '#f1f5f9' }}
        aria-label="현장 지도(카카오맵)"
      />
      {status === 'loading' && (
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>지도 로딩 중…</div>
      )}
      {status === 'error' && (
        <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
          지도를 불러오지 못했습니다. (VITE_KAKAO_MAP_KEY 확인)
        </div>
      )}
      <div className="geofence__coords">
        <span><strong>위도</strong> {value.lat.toFixed(6)}</span>
        <span><strong>경도</strong> {value.lng.toFixed(6)}</span>
        <button
          type="button"
          className="geofence__btn-tiny"
          onClick={searchAddress}
          disabled={readOnly || !address}
          title={address ? `'${address}' 주소로 이동` : '주소 없음'}
        >
          📍 주소로 이동
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SVG mock 패널 (카카오 키 없을 때 폴백)
// ─────────────────────────────────────────────────────────────
function MockMapPanel({ value, onChange, readOnly }: Omit<Props, 'address'>) {
  const id = useId();
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  const radiusPx = Math.min(MAP_W, MAP_H) / 2 - 12;
  const visualRadius = Math.min(value.radiusM * PX_PER_M, radiusPx);

  function handleMapClick(e: React.MouseEvent<SVGSVGElement>) {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - cx;
    const dy = y - cy;
    const dLat = -dy * 0.000009;
    const dLng = dx * 0.000009;
    onChange({
      ...value,
      lat: Number((value.lat + dLat).toFixed(6)),
      lng: Number((value.lng + dLng).toFixed(6)),
    });
  }

  return (
    <div className="geofence__map-wrap">
      <svg
        className={'geofence__map' + (readOnly ? ' is-ro' : '')}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleMapClick}
        aria-label="현장 지도"
      >
        <defs>
          <pattern id={`grid-${id}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.6" />
          </pattern>
          <pattern id={`major-${id}`} width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
          </pattern>
          <radialGradient id={`fade-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
            <stop offset="80%" stopColor="#0f766e" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="#f8fafc" />
        <rect width={MAP_W} height={MAP_H} fill={`url(#grid-${id})`} />
        <rect width={MAP_W} height={MAP_H} fill={`url(#major-${id})`} />
        <line x1="0" y1={cy - 30} x2={MAP_W} y2={cy - 30} stroke="#fef9c3" strokeWidth="6" />
        <line x1="0" y1={cy + 50} x2={MAP_W} y2={cy + 50} stroke="#fef9c3" strokeWidth="6" />
        <line x1={cx - 80} y1="0" x2={cx - 80} y2={MAP_H} stroke="#fef9c3" strokeWidth="6" />
        <line x1={cx + 60} y1="0" x2={cx + 60} y2={MAP_H} stroke="#fef9c3" strokeWidth="6" />
        {[50, 100, 150, 200].map((m) => {
          const r = m * PX_PER_M;
          if (r > radiusPx) return null;
          return (
            <g key={m}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#cbd5e1" strokeWidth="0.6" strokeDasharray="2 3" />
              <text x={cx + r + 3} y={cy + 3} fontSize="9" fill="#94a3b8">{m}m</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={visualRadius} fill={`url(#fade-${id})`} stroke="#0f766e" strokeWidth="1.5" strokeDasharray="4 3" />
        <g transform={`translate(${cx}, ${cy})`}>
          <circle r="13" fill="#0f766e" opacity="0.18" />
          <circle r="6" fill="#0f766e" stroke="#fff" strokeWidth="2" />
        </g>
        {!readOnly && (
          <text x={MAP_W - 8} y={MAP_H - 8} textAnchor="end" fontSize="9" fill="#64748b">
            지도 클릭 → 핀 위치 미세조정
          </text>
        )}
      </svg>

      <div className="geofence__coords">
        <span><strong>위도</strong> {value.lat.toFixed(6)}</span>
        <span><strong>경도</strong> {value.lng.toFixed(6)}</span>
        <button
          type="button"
          className="geofence__btn-tiny"
          onClick={() => alert('카카오맵 키(VITE_KAKAO_MAP_KEY) 설정 시 실제 지도가 표시됩니다.')}
          disabled={readOnly}
        >
          📍 지도 검색
        </button>
      </div>
    </div>
  );
}
