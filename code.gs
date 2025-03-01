/**
 * Google Apps Script to ingest a remote ICS file, transform it to JSON, cache it,
 * and provide it via a web app endpoint. Includes CLEAR_CACHE functionality.
 * Excludes "END:VEVENT" and "END:VCALENDAR" from the JSON output.
 */

function doGet(e) {
  var debug = PropertiesService.getScriptProperties().getProperty('DEBUG') === 'true';
  var clearCache = PropertiesService.getScriptProperties().getProperty('CLEAR_CACHE') === 'true';

  if (debug) {
    console.log('doGet called. Clear cache: ' + clearCache);
  }

  if (clearCache) {
    if (debug) {
      console.log('Clearing cache and regenerating JSON');
    }
    CacheService.getScriptCache().remove('cachedIcsJson');
    PropertiesService.getScriptProperties().setProperty('CLEAR_CACHE', 'false'); // Reset CLEAR_CACHE
    return processIcsAndReturnJson();
  }

  var cachedJson = CacheService.getScriptCache().get('cachedIcsJson');

  if (cachedJson) {
    if (debug) {
      console.log('Returning cached JSON');
    }
    return ContentService.createTextOutput(cachedJson).setMimeType(ContentService.MimeType.JSON);
  } else {
    if (debug) {
      console.log('Cache miss, fetching and processing ICS');
    }
    return processIcsAndReturnJson();
  }
}

function processIcsAndReturnJson() {
  var debug = PropertiesService.getScriptProperties().getProperty('DEBUG') === 'true';
  var icsUrl = PropertiesService.getScriptProperties().getProperty('ICS_URL');

  if (!icsUrl) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'ICS_URL script property not set' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var response = UrlFetchApp.fetch(icsUrl);
    var icsContent = response.getContentText();
    var json = icsToJson(icsContent);

    if (debug) {
      console.log('ICS processed, JSON:', JSON.stringify(json));
    }

    CacheService.getScriptCache().put('cachedIcsJson', JSON.stringify(json), 21600); // Cache for 6 hours
    return ContentService.createTextOutput(JSON.stringify(json)).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    if (debug) {
      console.error('Error processing ICS:', e);
    }
    return ContentService.createTextOutput(JSON.stringify({ error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function icsToJson(icsContent) {
  var events = [];
  var eventBlocks = icsContent.split('BEGIN:VEVENT');

  for (var i = 1; i < eventBlocks.length; i++) {
    var eventBlock = eventBlocks[i];
    var event = {};
    var lines = eventBlock.split('\n');

    for (var j = 0; j < lines.length; j++) {
      var line = lines[j].trim();

      if (line.startsWith('END:VEVENT') || line.startsWith('END:VCALENDAR')) {
        continue; // Skip END lines
      }

      var parts = line.split(':');
      var key = parts[0].split(';')[0]; // Remove parameters like TZID
      var value = parts.slice(1).join(':');

      if (key && value) {
        event[key] = value;
      }
    }
    events.push(event);
  }
  return events;
}

/**
 * Function to set up the Script Properties.
 */
function setupScriptProperties() {
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty('ICS_URL', 'YOUR_ICS_URL_HERE'); // Replace with your ICS URL
  properties.setProperty('DEBUG', 'false'); // Set to 'true' for debug logging
  properties.setProperty('CLEAR_CACHE', 'false'); // Set to 'true' to clear cache on next request.
}
