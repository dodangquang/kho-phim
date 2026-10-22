package com.phimmoitv.app.data

import org.junit.Assert.*
import org.junit.Test

class StartupNoticeTest {
    @Test fun onlyActiveBoundedNoticesAreAccepted() {
        assertNotNull(StartupNotice.validated(true, "9922-ads-2026-10-22", "Cập nhật", "Thông báo"))
        assertNull(StartupNotice.validated(false, "notice", "Title", "Message"))
        assertNull(StartupNotice.validated(true, "../notice", "Title", "Message"))
        assertNull(StartupNotice.validated(true, "n".repeat(81), "Title", "Message"))
        assertNull(StartupNotice.validated(true, "notice", " ", "Message"))
        assertNull(StartupNotice.validated(true, "notice", "T".repeat(121), "Message"))
        assertNull(StartupNotice.validated(true, "notice", "Title", "M".repeat(1201)))
    }
}
