/**
 * Google Apps Script to ingest a remote ICS file, transform it to JSON, cache it,
 * and provide it via a web app endpoint. Includes CLEAR_CACHE functionality.
 * Excludes "END:VEVENT" and "END:VCALENDAR" from the JSON output.
 * Fetches additional data from event URLs based on CSS classes defined in script properties.
 * Allows renaming of JSON keys via script properties.
 * Sends an email log if EMAIL_LOG script property is set.
 * Allows placeholder values via PLACEHOLDER_VALUES script property.
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

function cleanUrl(url) {
  if (!url) {
    return "";
  }
  let cleanedUrl = url.trim(); // Start with a basic trim

  // Inspect character codes (for debugging)
  if (PropertiesService.getScriptProperties().getProperty('DEBUG') === 'true') {
    let charCodes = [];
    for (let i = 0; i < cleanedUrl.length; i++) {
      charCodes.push(cleanedUrl.charCodeAt(i));
    }
    //console.log("Character Codes: " + charCodes.join(", "));
  }

  cleanedUrl = cleanedUrl.replace(/[\x00-\x1F\x7F-\xA0\u2000-\u206F\u3000]+/g, ''); //Remove control and whitespace
  cleanedUrl = cleanedUrl.replace(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g, ''); // Remove more unicode characters

  return cleanedUrl;
}

function processIcsAndReturnJson() {
  var debug = PropertiesService.getScriptProperties().getProperty('DEBUG') === 'true';
  var icsUrl = PropertiesService.getScriptProperties().getProperty('ICS_URL');
  var additionalDataConfig = PropertiesService.getScriptProperties().getProperty('ADDITIONAL_DATA_CONFIG');
  var keyRenames = PropertiesService.getScriptProperties().getProperty('KEY_RENAMES');
  var emailLog = PropertiesService.getScriptProperties().getProperty('EMAIL_LOG');
  var cacheTimeout = parseInt(PropertiesService.getScriptProperties().getProperty('CACHE_TIMEOUT')) || 21600; // Default: 6 hours
  var placeholderValues = PropertiesService.getScriptProperties().getProperty('PLACEHOLDER_VALUES');

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

    if (placeholderValues) {
      json = applyPlaceholderValues(json, placeholderValues);
    }

    if (keyRenames) {
      json = renameJsonKeys(json, keyRenames);
    }

    if (debug) {
      console.log('ICS processed, JSON:', JSON.stringify(json));
    }

    CacheService.getScriptCache().put('cachedIcsJson', JSON.stringify(json), cacheTimeout);

    if (emailLog) {
      sendEmailLog(JSON.stringify(json, null, 2)); // Send formatted JSON in email
    }

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
    let lines = eventBlock.split('\n');
    
    // Join wrapped lines first (lines starting with a space)
    let unwrappedLines = [];
    let currentLine = "";
    
    for (let j = 0; j < lines.length; j++) {
      let line = lines[j];
      if (line.startsWith(" ")) {
        // This is a continuation line, append it to the current line
        currentLine += line.trim();
      } else {
        // This is a new line
        if (currentLine) {
          unwrappedLines.push(currentLine);
        }
        currentLine = line;
      }
    }
    if (currentLine) {
      unwrappedLines.push(currentLine);
    }
    
    // Now process the unwrapped lines
    for (let j = 0; j < unwrappedLines.length; j++) {
      let line = unwrappedLines[j].trim();

      if (line.startsWith('END:VEVENT') || line.startsWith('END:VCALENDAR')) {
        continue;
      }

      let parts = line.split(':');
      let key = parts[0].split(';')[0];
      let value = parts.slice(1).join(':');

      if (key && value) {
        if (key === 'URL') {
          value = cleanUrl(value);
        }
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
      var cleanedUrl = cleanUrl(event.URL);
      if (PropertiesService.getScriptProperties().getProperty('DEBUG') === 'true') {
        console.log("Attempting to fetch URL: " + cleanedUrl);
      }
      try {
        var response = UrlFetchApp.fetch(cleanedUrl);
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
        console.error('Error fetching or parsing URL:', cleanedUrl, e);
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
      var newKey = renameMap[key] || key; // Use new key if defined, otherwise keep original
      newEvent[newKey] = event[key];
    }
    return newEvent;
  });
}

function applyPlaceholderValues(events, placeholderConfig) {
  var placeholders = placeholderConfig.split(',');
  var placeholderMap = {};

  placeholders.forEach(function(placeholder) {
    var parts = placeholder.split(':');
    if (parts.length === 2) {
      placeholderMap[parts[0].trim()] = parts[1].trim();
    }
  });

  return events.map(function(event) {
    for (var newKey in placeholderMap) {
      var existingKey = placeholderMap[newKey];
      if (event[existingKey] !== undefined) {
        event[newKey] = event[existingKey];
      }
    }
    return event;
  });
}

function sendEmailLog(jsonString) {
  var subject = "ICS to JSON Script Execution Log";
  var body = "Script executed successfully. Here is the JSON output:\n\n" + jsonString;
  MailApp.sendEmail(Session.getActiveUser().getEmail(), subject, body);
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
  properties.setProperty('EMAIL_LOG', 'true');
  properties.setProperty('CACHE_TIMEOUT', '21600');
  properties.setProperty('PLACEHOLDER_VALUES', 'title2:SUMMARY,description2:DESCRIPTION'); // Example placeholder values
}
