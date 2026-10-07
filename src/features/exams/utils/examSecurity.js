export function securityLevel(exam) {
  if (['off', 'normal', 'strict'].includes(exam?.securityLevel)) return exam.securityLevel;
  if (exam?.securityLevel != null) return 'strict';
  return exam?.isAntiCheat ? 'strict' : 'off';
}

export function screenCheck(details, screen, verified) {
  if (screen?.isExtended === true || (Array.isArray(details?.screens) && details.screens.length > 1)) return 'multiple';
  if (!verified || !Array.isArray(details?.screens) || details.screens.length !== 1) return 'unknown';
  return 'single';
}

export function requiresScreenVerification(level) {
  return level === 'strict';
}

export function securityViolation({ level, fullscreen, hidden, focused, screenState }) {
  if (level !== 'strict') return '';
  if (screenState === 'multiple') return 'Phát hiện màn hình phụ. Hãy ngắt kết nối màn hình phụ trước khi tiếp tục.';
  if (screenState !== 'single') return 'Không xác minh được màn hình. Hãy cấp quyền kiểm tra màn hình để tiếp tục.';
  if (!fullscreen) return 'Bạn đã thoát toàn màn hình. Hãy mở lại toàn màn hình để tiếp tục.';
  if (hidden || !focused) return 'Bạn đã rời tab hoặc cửa sổ bài thi. Hãy quay lại bài thi để tiếp tục.';
  return '';
}
