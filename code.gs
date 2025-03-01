/**
 * Google Apps Script to ingest a remote ICS file, transform it to JSON, cache it,
 * and provide it via a web app endpoint. Includes CLEAR_CACHE functionality.
 * Excludes "END:VEVENT" and "END:VCALENDAR" from the JSON output.
 * Fetches additional data from event URLs based on CSS classes defined in script properties.
 * Allows renaming of JSON keys via script properties.
 * Allows setting cache timeout via script properties.
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
  var additionalDataConfig = PropertiesService.getScriptProperties().getProperty('ADDITIONAL_DATA_CONFIG');
  var keyRenames = PropertiesService.getScriptProperties().getProperty('KEY_RENAMES');
  var cacheTimeout = parseInt(PropertiesService.getScriptProperties().getProperty('CACHE_TIMEOUT')) || 21600; // Default: 6 hours

  if (!icsUrl) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'ICS_URL script property not set' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var response = UrlFetchApp.fetch(icsUrl);
    var icsContent = response.getContentText();
    var json = icsToJson(icsContent);

    if (additionalDataConfig) {
      json = enrichEventsWithAdditionalData(json, additionalDataConfig);
    }

    if (keyRenames) {
      json = renameJsonKeys(json, keyRenames);
    }

    if (debug) {
      console.log('ICS processed, JSON:', JSON.stringify(json));
    }

    CacheService.getScriptCache().put('cachedIcsJson', JSON.stringify(json), cacheTimeout);
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

function enrichEventsWithAdditionalData(events, configString) {
  var configs = configString.split(',');
  var configMap = {};

  configs.forEach(function(config) {
    var parts = config.split(':');
    if (parts.length === 2) {
      configMap[parts[0].trim()] = parts[1].trim();
    }
  });

  return events.map(function(event) {
    if (event.URL) {
      try {
        var response = UrlFetchApp.fetch(event.URL);
        var html = response.getContentText();

        for (var key in configMap) {
          var className = configMap[key];
          var regex = new RegExp('<[^>]+class="[^"]*' + className + '[^"]*">([^<]+)<', 'i');
          var match = regex.exec(html);

          if (match && match[1]) {
            event[key] = match[1].trim();
          } else {
            event[key] = "";
          }
        }
      } catch (e) {
        console.error('Error fetching or parsing URL:', event.URL, e);
        for (var key in configMap) {
          event[key] = "";
        }
      }
    }
    return event;
  });
}

function renameJsonKeys(events, renameConfig) {
  var renames = renameConfig.split(',');
  var renameMap = {};

  renames.forEach(function(rename) {
    var parts = rename.split(':');
    if (parts.length === 2) {
      renameMap[parts[0].trim()] = parts[1].trim();
    }
  });

  return events.map(function(event) {
    var newEvent = {};
    for (var key in event) {
      var newKey = renameMap[key] || key;
      newEvent[newKey] = event[key];
    }
    return newEvent;
  });
}

/**
 * Function to set up the Script Properties.
 */
function setupScriptProperties() {
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty('ICS_URL', 'YOUR_ICS_URL_HERE');
  properties.setProperty('DEBUG', 'false');
  properties.setProperty('CLEAR_CACHE', 'false');
  properties.setProperty('ADDITIONAL_DATA_CONFIG', 'SUBTITLE:event_subtitle,ROOM:event_room,VIRTUALURL:event_virtual_url');
  properties.setProperty('KEY_RENAMES', 'SUMMARY:title,DESCRIPTION:details');
  properties.setProperty('CACHE_TIMEOUT', '21600'); // Default: 6 hours (seconds)
}
