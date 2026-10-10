# Estonian regional formats

Owner: project maintainer. Accepted through the request to correct regional formats before recording the complete demo.

The product uses Estonian formats regardless of the browser language or computer timezone: dates DD.MM.YYYY, 24-hour times HH:mm, decimal commas and space grouping. Business datetimes continue to use Europe/Tallinn and are stored as UTC; calendar-only service dates remain ISO dates in the API. Money stays integer euro cents, with exact conversion from input text rather than floating-point rounding. Whole-euro displays may omit cents; nonzero cents retain both decimal places.

Numeric forms accept an Estonian decimal comma or a compatible decimal point and valid space/NBSP grouping. Reject mixed separators, malformed grouping, scientific/hex notation, excessive fractional cents and unsafe values. Coordinates use localized decimals and an unambiguous semicolon between latitude and longitude. Date entry has an explicit Estonian text format, retaining an optional native calendar picker; the browser's calendar dialog language may follow its own settings. CSV and REST machine formats remain unchanged.

Acceptance: enter grouped/comma prices, quantities and coordinates through real browser forms and verify exact API values; show consistent numeric dates and Tallinn time under non-Estonian browser locales/timezones; retain daylight-saving gap/fold behavior; preserve existing procurement, permissions, frozen history and financial scenarios. Verify desktop/mobile form usability and the full canonical gates before creating the screen recording.
