# ics-to-json

Google Apps Script to ingest a remote ICS file, transform it to JSON, cache it, and provide it via a web app endpoint with JSON output.

| Script Property Name   | Value                                   | Description                                                                                                             |
| ---------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ADDITIONAL_DATA_CONFIG | SUBTITLE:event_subtitle,ROOM:event_room | Collects text wrapped in the named CSS class from a given event's URL and assigns it as the value to the specified key. |
| CACHE_TIMEOUT          | 300                                     | Maximum age of cached data until it is regenerated.                                                                     |
| CLEAR_CACHE            | true                                    | Set to true to clear cache on next run, reverts itself to false after success.                                          |
| DEBUG                  | true                                    | Exposes verbose logging in the console.                                                                                 |
| ICS_URL                | URL                                     | Source of ICS data.                                                                                                     |
| KEY_RENAMES            | DESCRIPTION:description,SUMMARY:title   | Replaces key names derived from the ICS file with custom string.                                                        |
| PLACEHOLDER_VALUES            | description2:DESCRIPTION,title2:SUMMARY   | Inserts custom key names with values pulled from other keys.                                                        |
