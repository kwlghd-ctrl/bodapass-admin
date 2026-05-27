import { Tooltip } from '../../../components/Tooltip';
import type { AttendanceRecord } from '../../../api/attendance.types';

export function GeofenceBadge({ rec }: { rec: AttendanceRecord }) {
  const result = rec.geofenceResult;
  if (!result || result === 'INSIDE') return null;
  if (result === 'OUTSIDE') {
    const dist = rec.distanceFromSiteM ? `${rec.distanceFromSiteM}m` : '반경 밖';
    const acc = rec.checkInLocation?.accuracy;
    return (
      <Tooltip
        tone="danger"
        title="⚠ 현장 밖 출근 시도"
        body={
          <>
            현장 좌표로부터 <strong>{dist}</strong> 떨어진 위치에서 인증 시도
            {acc && <> · 정확도 ±{acc}m</>}
          </>
        }
      >
        <span className="att-day-list__geo att-day-list__geo--out" aria-label={`현장 밖 ${dist}`}>
          ⚠
        </span>
      </Tooltip>
    );
  }
  if (result === 'LOW_ACCURACY') {
    const acc = rec.checkInLocation?.accuracy;
    return (
      <Tooltip
        tone="warning"
        title="📍 GPS 오차범위 초과"
        body={
          <>
            측정 정확도{acc && <> ±{acc}m</>}로 위치 신뢰도가 낮습니다. 실내·터널·고층빌딩 영향 가능
          </>
        }
      >
        <span className="att-day-list__geo att-day-list__geo--low" aria-label="GPS 오차">
          📍
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      tone="default"
      title="❓ 위치정보 미수집"
      body={<>위치 권한이 없거나 반장이 수동으로 처리한 출근입니다</>}
    >
      <span className="att-day-list__geo att-day-list__geo--none" aria-label="GPS 위치 미수집">
        ❓
      </span>
    </Tooltip>
  );
}
