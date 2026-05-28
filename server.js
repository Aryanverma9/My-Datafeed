const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const symbolsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'symbols.json'), 'utf-8'));

function loadSymbolData(symbol) {
  try {
    const dataPath = path.join(__dirname, 'data', `${symbol}.json`);
    const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    // Handle both formats: direct array or {data: array}
    let dataArray;
    if (Array.isArray(rawData)) {
      dataArray = rawData;
    } else if (rawData.data && Array.isArray(rawData.data)) {
      dataArray = rawData.data;
    } else {
      return null;
    }

    // Normalize timestamps to milliseconds
    const normalizedData = dataArray.map(bar => {
      const normalized = { ...bar };
      
      // Convert timestamp field to time field in milliseconds
      if ('timestamp' in bar && !('time' in bar)) {
        normalized.time = bar.timestamp * 1000;
      } else if ('time' in bar && typeof bar.time === 'number' && bar.time < 10000000000) {
        // If time is in seconds (< 10 billion), convert to ms
        normalized.time = bar.time * 1000;
      } else if ('time' in bar) {
        normalized.time = bar.time;
      }
      
      return normalized;
    });

    return { data: normalizedData };
  } catch (error) {
    console.error('[loadSymbolData] Error loading', symbol, ':', error.message);
    return null;
  }
}

function getAvailableDataFiles() {
  try {
    const dataDir = path.join(__dirname, 'data');
    return fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  } catch (error) {
    return [];
  }
}

function resolutionToMinutes(resolution) {
  if (!resolution) return 1;

  // Handle numeric-only resolutions (e.g., "1", "5", "60", "120")
  if (/^\d+$/.test(resolution)) {
    return parseInt(resolution);
  }

  // Handle special cases
  if (resolution === 'D' || resolution === '1D') return 24 * 60;
  if (resolution === 'W' || resolution === '1W') return 7 * 24 * 60;
  if (resolution === 'M' || resolution === '1M') return 30 * 24 * 60;
  if (resolution === '12M') return 365 * 24 * 60;

  // Handle resolutions with suffixes (e.g., "1m", "2h", "1D")
  const match = resolution.match(/^(\d+)([mhDWMY])$/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];

    // Case-sensitive check for 'm' (minutes) vs 'M' (months)
    if (unit === 'm') return value;
    if (unit === 'M') return value * 30 * 24 * 60;
    if (unit === 'h' || unit === 'H') return value * 60;
    if (unit === 'd' || unit === 'D') return value * 24 * 60;
    if (unit === 'w' || unit === 'W') return value * 7 * 24 * 60;
    if (unit === 'y' || unit === 'Y') return value * 365 * 24 * 60;
  }

  return 1;
}

function aggregateCandles(data, resolution) {
  const targetMinutes = resolutionToMinutes(resolution);

  // If target resolution is 1 minute or less, return data as-is
  if (targetMinutes <= 1) {
    return data;
  }

  const aggregated = [];
  let currentBar = null;
  let barStartTime = null;

  for (const bar of data) {
    const barTime = bar.time;
    
    // Calculate bar boundary aligned to epoch
    // This ensures consistent alignment: 3m bars at 0,3,6,9... minutes
    const barTimeSec = Math.floor(barTime / 1000);
    const barTimeMin = Math.floor(barTimeSec / 60);
    const barIndex = Math.floor(barTimeMin / targetMinutes);
    const newBarStartTime = barIndex * targetMinutes * 60 * 1000;

    if (newBarStartTime !== barStartTime) {
      // Push completed bar
      if (currentBar !== null) {
        aggregated.push(currentBar);
      }
      
      // Start new bar
      barStartTime = newBarStartTime;
      currentBar = {
        time: newBarStartTime,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume || 0
      };
    } else if (currentBar) {
      // Update existing bar with OHLCV aggregation rules
      currentBar.high = Math.max(currentBar.high, bar.high);
      currentBar.low = Math.min(currentBar.low, bar.low);
      currentBar.close = bar.close; // Last close
      currentBar.volume += (bar.volume || 0);
    }
  }

  // Push final bar
  if (currentBar !== null) {
    aggregated.push(currentBar);
  }

  return aggregated;
}

app.get('/config', (req, res) => {
  res.json({
    supports_search: true,
    supports_group_request: false,
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
    exchanges: [
      { value: 'BINANCE', name: 'Binance', desc: 'Binance Crypto Exchange' },
      { value: 'FOREX', name: 'Forex', desc: 'Foreign Exchange Market' },
      { value: 'NSE', name: 'NSE', desc: 'National Stock Exchange of India' }
    ],
    symbols_types: [
      { name: 'Crypto', value: 'crypto' },
      { name: 'Forex', value: 'forex' },
      { name: 'Index', value: 'index' }
    ],
    supported_resolutions: [
      '1', '2', '3', '4', '5', '7', '8', '10', '15', '20', '30', '45',
      '60', '120', '180', '240',
      'D', 'W', 'M', '12M'
    ],
    supports_history: true
  });
});

app.get('/symbols', (req, res) => {
  const symbol = req.query.symbol;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }

  const symbolInfo = symbolsConfig.symbols.find(s => s.symbol === symbol);

  if (!symbolInfo) {
    return res.status(404).json({ error: 'Symbol not found' });
  }

  const symbolData = loadSymbolData(symbol);

  if (!symbolData) {
    return res.status(404).json({ error: 'Symbol data not found' });
  }

  res.json({
    name: symbolInfo.symbol,
    ticker: symbolInfo.ticker,
    description: symbolInfo.description,
    type: symbolInfo.type,
    session: symbolInfo.session,
    exchange: symbolInfo.exchange,
    listed_exchange: symbolInfo.exchange,
    timezone: symbolInfo.timezone,
    minmov: symbolInfo.minmov,
    pricescale: symbolInfo.pricescale,
    has_intraday: symbolInfo.has_intraday,
    has_daily: symbolInfo.has_daily,
    has_weekly_and_monthly: symbolInfo.has_weekly_and_monthly,
    supported_resolutions: symbolInfo.supported_resolutions,
    data_status: symbolInfo.data_status,
    has_no_volume: false
  });
});

app.get('/symbol_info', (req, res) => {
  const group = req.query.group;

  const symbols = symbolsConfig.symbols.map(s => ({
    symbol: s.symbol,
    full_name: s.full_name,
    description: s.description,
    exchange: s.exchange,
    type: s.type
  }));

  res.json({
    symbol: symbols
  });
});

app.get('/search', (req, res) => {
  const query = (req.query.query || '').toUpperCase();
  const type = req.query.type;
  const exchange = req.query.exchange;
  const limit = parseInt(req.query.limit) || 30;

  let results = symbolsConfig.symbols;

  if (query) {
    results = results.filter(s =>
      s.symbol.includes(query) ||
      s.description.toUpperCase().includes(query)
    );
  }

  if (type) {
    results = results.filter(s => s.type === type);
  }

  if (exchange) {
    results = results.filter(s => s.exchange === exchange);
  }

  results = results.slice(0, limit).map(s => ({
    symbol: s.symbol,
    full_name: s.full_name,
    description: s.description,
    exchange: s.exchange,
    ticker: s.ticker,
    type: s.type
  }));

  res.json(results);
});

app.get('/history', (req, res) => {
  // ============================================================
  // DISABLE HTTP CACHING - Prevent 304 Not Modified responses
  // ============================================================
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  const symbol = req.query.symbol;
  const from = parseInt(req.query.from);
  const to = parseInt(req.query.to);
  const resolution = req.query.resolution || '1';
  const countBack = parseInt(req.query.countBack);

  // ============================================================
  // DIAGNOSTIC LOGGING - Log all request parameters
  // ============================================================
  console.log('');
  console.log('[HISTORY] ========== NEW REQUEST ==========');
  console.log('[HISTORY] Request params:', {
    symbol,
    from,
    to,
    resolution,
    countBack: isNaN(countBack) ? 'not provided' : countBack,
    from_iso: from ? new Date(from * 1000).toISOString() : 'invalid',
    to_iso: to ? new Date(to * 1000).toISOString() : 'invalid',
    range_hours: (from && to) ? ((to - from) / 3600).toFixed(2) : 'N/A'
  });

  // Validation - use isNaN to handle from=0 correctly
  if (!symbol) {
    console.log('[HISTORY] ERROR: Symbol parameter missing');
    return res.status(400).json({ s: 'error', errmsg: 'Symbol parameter is required' });
  }

  if (isNaN(from) || isNaN(to)) {
    console.log('[HISTORY] ERROR: From or To parameter invalid');
    return res.status(400).json({ s: 'error', errmsg: 'From and to parameters are required' });
  }

  const symbolData = loadSymbolData(symbol);

  if (!symbolData || !symbolData.data || symbolData.data.length === 0) {
    console.log('[HISTORY] ERROR: Symbol data not found or empty');
    return res.json({ s: 'no_data', nextTime: null });
  }

  console.log('[HISTORY] Raw data loaded:', {
    total_bars: symbolData.data.length,
    first_bar_time: new Date(symbolData.data[0].time).toISOString(),
    last_bar_time: new Date(symbolData.data[symbolData.data.length - 1].time).toISOString()
  });

  // Sort data ascending by time (critical for Bar Replay)
  const sortedData = [...symbolData.data].sort((a, b) => a.time - b.time);

  // Remove duplicates by timestamp
  const uniqueBars = [];
  const seenTimes = new Set();
  for (const bar of sortedData) {
    if (!seenTimes.has(bar.time)) {
      seenTimes.add(bar.time);
      uniqueBars.push(bar);
    }
  }

  console.log('[HISTORY] After deduplication:', {
    unique_bars: uniqueBars.length,
    duplicates_removed: sortedData.length - uniqueBars.length
  });

  const fromMs = from * 1000;
  const toMs = to * 1000;

  console.log('[HISTORY] Time range in ms:', {
    fromMs,
    toMs,
    first_bar_ms: uniqueBars[0].time,
    last_bar_ms: uniqueBars[uniqueBars.length - 1].time,
    request_before_data: fromMs < uniqueBars[0].time,
    request_after_data: toMs > uniqueBars[uniqueBars.length - 1].time
  });

  let filteredData;

  // Handle countBack mode (used by TradingView for initial load)
  if (!isNaN(countBack) && countBack > 0) {
    console.log('[HISTORY] Using countBack mode:', countBack);
    
    // CountBack mode: return last N bars before 'to'
    const barsBeforeTo = uniqueBars.filter(bar => bar.time <= toMs);
    
    console.log('[HISTORY] Bars before "to":', barsBeforeTo.length);
    
    if (barsBeforeTo.length === 0) {
      console.log('[HISTORY] RESULT: no_data (no bars before "to")');
      return res.json({ s: 'no_data', nextTime: null });
    }
    
    // Get last countBack 1-minute bars, then aggregate
    filteredData = barsBeforeTo.slice(-countBack);
    console.log('[HISTORY] Selected last', countBack, 'bars, got:', filteredData.length);
  } else {
    console.log('[HISTORY] Using range mode: from/to');
    
    // Range mode: filter by from/to
    filteredData = uniqueBars.filter(bar => {
      return bar.time >= fromMs && bar.time <= toMs;
    });

    console.log('[HISTORY] Bars in range [from, to]:', filteredData.length);

    // If no data in range, return no_data (no fallback)
    if (filteredData.length === 0) {
      console.log('[HISTORY] RESULT: no_data (no bars in requested range)');
      console.log('[HISTORY] Suggestion: Check if requested range is valid');
      console.log('[HISTORY] Data availability:', {
        earliest_available: new Date(uniqueBars[0].time).toISOString(),
        latest_available: new Date(uniqueBars[uniqueBars.length - 1].time).toISOString(),
        requested_from: new Date(fromMs).toISOString(),
        requested_to: new Date(toMs).toISOString()
      });
      return res.json({ s: 'no_data', nextTime: null });
    }
  }

  console.log('[HISTORY] Before aggregation:', {
    bars: filteredData.length,
    first_bar: new Date(filteredData[0].time).toISOString(),
    last_bar: new Date(filteredData[filteredData.length - 1].time).toISOString()
  });

  // Aggregate candles based on resolution
  const aggregatedData = aggregateCandles(filteredData, resolution);

  console.log('[HISTORY] After aggregation to resolution', resolution + ':', {
    bars: aggregatedData.length,
    first_bar: aggregatedData.length > 0 ? new Date(aggregatedData[0].time).toISOString() : 'N/A',
    last_bar: aggregatedData.length > 0 ? new Date(aggregatedData[aggregatedData.length - 1].time).toISOString() : 'N/A'
  });

  // Build UDF response
  const response = {
    s: 'ok',
    t: aggregatedData.map(bar => Math.floor(bar.time / 1000)),
    o: aggregatedData.map(bar => bar.open),
    h: aggregatedData.map(bar => bar.high),
    l: aggregatedData.map(bar => bar.low),
    c: aggregatedData.map(bar => bar.close),
    v: aggregatedData.map(bar => bar.volume)
  };

  console.log('[HISTORY] RESULT: ok, returning', response.t.length, 'bars');
  console.log('[HISTORY] ========================================');
  console.log('');

  res.json(response);
});

app.get('/time', (req, res) => {
  res.send(Math.floor(Date.now() / 1000).toString());
});

app.get('/health', (req, res) => {
  const dataFiles = getAvailableDataFiles();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    symbols_available: symbolsConfig.symbols.length,
    data_files_available: dataFiles.length,
    data_files: dataFiles
  });
});

app.get('/data', (req, res) => {
  const dataFiles = getAvailableDataFiles();
  const filesInfo = dataFiles.map(file => {
    const symbol = file.replace('.json', '');
    const symbolInfo = symbolsConfig.symbols.find(s => s.symbol === symbol);
    return {
      file: file,
      symbol: symbol,
      description: symbolInfo ? symbolInfo.description : 'Unknown',
      exchange: symbolInfo ? symbolInfo.exchange : 'Unknown',
      url: `/data/${file}`
    };
  });

  res.json({
    total: filesInfo.length,
    files: filesInfo
  });
});

app.get('/data/:symbol.json', (req, res) => {
  const symbol = req.params.symbol;
  const symbolData = loadSymbolData(symbol);

  if (!symbolData) {
    return res.status(404).json({ error: 'Data file not found' });
  }

  res.json(symbolData);
});

app.get('/', (req, res) => {
  res.json({
    name: 'TradingView UDF Data Feed Server',
    version: '1.0.0',
    description: 'Real OHLCV data feed for TradingView charts',
    endpoints: {
      config: '/config',
      symbols: '/symbols?symbol=BTCUSDT',
      symbol_info: '/symbol_info',
      search: '/search?query=BTC',
      history: '/history?symbol=BTCUSDT&from=1704067200&to=1704153600&resolution=60',
      time: '/time',
      health: '/health',
      data: '/data',
      data_file: '/data/BTCUSDT.json'
    },
    available_symbols: symbolsConfig.symbols.map(s => s.symbol)
  });
});

app.listen(PORT, () => {
  console.log('');
  console.log('=================================================');
  console.log('  TradingView UDF Data Feed Server');
  console.log('=================================================');
  console.log(`  Server running on: http://localhost:${PORT}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /config - UDF Configuration');
  console.log('  GET  /symbols - Symbol information');
  console.log('  GET  /symbol_info - Symbol info for groups');
  console.log('  GET  /search - Symbol search');
  console.log('  GET  /history - Historical data (with replay support)');
  console.log('  GET  /time - Server time');
  console.log('  GET  /health - Health check');
  console.log('  GET  /data - List available data files');
  console.log('  GET  /data/<symbol>.json - Direct data file access');
  console.log('');
  console.log(`Available symbols: ${symbolsConfig.symbols.map(s => s.symbol).join(', ')}`);
  console.log('=================================================');
  console.log('');
});
