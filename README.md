# TradingView UDF Data Feed Server

A Node.js Express server implementing the TradingView UDF (Universal Data Feed) protocol, serving real OHLCV (Open, High, Low, Close, Volume) data from JSON files.

## Features

- Full TradingView UDF protocol implementation
- Real OHLCV data from JSON sources
- Automatic time aggregation from 1-minute candles to any resolution
- Support for multiple asset classes (Crypto, Forex, Indices)
- Symbol search and filtering
- Time-series data retrieval with customizable time ranges
- Support for 20+ time resolutions (1m to 12M)
- CORS enabled for cross-origin requests
- Health check and data availability endpoints

## Supported Symbols

- **BTCUSDT** - Bitcoin / Tether USD (Binance)
- **XAUUSD** - Gold / US Dollar (Forex)
- **NIFTY** - Nifty 50 Index (NSE)

## Installation

```bash
npm install
```

## Usage

Start the server:

```bash
npm start
```

or in development mode:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Resolution Format

TradingView expects resolutions in specific formats:
- **Minutes**: Numeric values (e.g., `1`, `2`, `3`, `4`, `5`, `7`, `8`, `10`, `15`, `20`, `30`, `45`)
- **Hours**: Numeric values in minutes (e.g., `60` for 1h, `120` for 2h, `180` for 3h, `240` for 4h)
- **Daily**: `D` or `1D`
- **Weekly**: `W` or `1W`
- **Monthly**: `M` or `1M`
- **Yearly**: `12M`

Supported resolutions: `1`, `2`, `3`, `4`, `5`, `7`, `8`, `10`, `15`, `20`, `30`, `45`, `60` (1h), `120` (2h), `180` (3h), `240` (4h), `D`, `W`, `M`, `12M`

**Note**: The JSON data files contain 1-minute candles, and the server automatically aggregates them to any requested resolution.

## API Endpoints

### Configuration & Info

#### GET `/`
Returns general server information and available endpoints.

```bash
curl http://localhost:3000/
```

#### GET `/config`
Returns UDF configuration required by TradingView.

```bash
curl http://localhost:3000/config
```

#### GET `/health`
Health check endpoint with available symbols and data files.

```bash
curl http://localhost:3000/health
```

### Symbol Information

#### GET `/symbols?symbol=BTCUSDT`
Get detailed information about a specific symbol.

**Parameters:**
- `symbol` (required): Symbol name (e.g., BTCUSDT)

```bash
curl "http://localhost:3000/symbols?symbol=BTCUSDT"
```

#### GET `/symbol_info`
Get symbol information for all available symbols.

```bash
curl http://localhost:3000/symbol_info
```

#### GET `/search?query=BTC&limit=30`
Search for symbols by query string.

**Parameters:**
- `query`: Search query (searches symbol name and description)
- `type`: Filter by type (crypto, forex, index)
- `exchange`: Filter by exchange
- `limit`: Maximum results (default: 30)

```bash
curl "http://localhost:3000/search?query=BTC&limit=10"
```

### Historical Data

#### GET `/history?symbol=BTCUSDT&from=1704067200&to=1704153600&resolution=60`
Get historical OHLCV data for a symbol.

**Parameters:**
- `symbol` (required): Symbol name
- `from` (required): Start time (Unix timestamp in seconds)
- `to` (required): End time (Unix timestamp in seconds)
- `resolution`: Time resolution (1, 2, 3, 4, 5, 7, 8, 10, 15, 20, 30, 45, 60, 120, 180, 240, D, W, M, 12M)

**Response:**
```json
{
  "s": "ok",
  "t": [1704067200, 1704070800, ...],
  "o": [42150.50, 42280.00, ...],
  "h": [42380.75, 42450.00, ...],
  "l": [42050.25, 42180.50, ...],
  "c": [42280.00, 42350.25, ...],
  "v": [15234.52, 14562.38, ...]
}
```

```bash
curl "http://localhost:3000/history?symbol=BTCUSDT&from=1704067200&to=1704153600&resolution=60"
```

### Time & Data

#### GET `/time`
Get current server time as Unix timestamp (seconds).

```bash
curl http://localhost:3000/time
```

#### GET `/data`
List all available data files with metadata.

```bash
curl http://localhost:3000/data
```

#### GET `/data/BTCUSDT.json`
Get raw data file for a symbol.

```bash
curl http://localhost:3000/data/BTCUSDT.json
```

## Data Structure

### symbols.json
Configuration file containing symbol metadata:

```json
{
  "symbols": [
    {
      "symbol": "BTCUSDT",
      "full_name": "BTCUSDT",
      "description": "Bitcoin / Tether USD",
      "exchange": "BINANCE",
      "type": "crypto",
      "session": "24x7",
      "timezone": "Etc/UTC",
      "ticker": "BTCUSDT",
      "minmov": 1,
      "pricescale": 100,
      "has_intraday": true,
      "has_daily": true,
      "has_weekly_and_monthly": true,
      "supported_resolutions": ["1", "2", "3", "4", "5", "7", "8", "10", "15", "20", "30", "45", "60", "120", "180", "240", "D", "W", "M", "12M"],
      "data_status": "streaming"
    }
  ]
}
```

### Data Files (data/SYMBOL.json)
OHLCV data files contain historical price data:

```json
{
  "symbol": "BTCUSDT",
  "exchange": "BINANCE",
  "type": "crypto",
  "data": [
    {
      "time": 1704067200000,
      "open": 42150.50,
      "high": 42380.75,
      "low": 42050.25,
      "close": 42280.00,
      "volume": 15234.52
    }
  ]
}
```

## Adding New Symbols

To add a new symbol:

1. **Create a data file** in the `data/` folder (e.g., `data/NEWSYMBOL.json`):

```json
{
  "symbol": "NEWSYMBOL",
  "exchange": "EXCHANGE_NAME",
  "type": "crypto|forex|index",
  "data": [
    {
      "time": 1704067200000,
      "open": 100.00,
      "high": 102.50,
      "low": 98.75,
      "close": 101.25,
      "volume": 1000000
    }
  ]
}
```

2. **Add symbol configuration** to `symbols.json`:

```json
{
  "symbol": "NEWSYMBOL",
  "full_name": "NEW SYMBOL",
  "description": "Your symbol description",
  "exchange": "EXCHANGE_NAME",
  "type": "crypto",
  "session": "24x7",
  "timezone": "Etc/UTC",
  "ticker": "NEWSYMBOL",
  "minmov": 1,
  "pricescale": 100,
  "has_intraday": true,
  "has_daily": true,
  "has_weekly_and_monthly": true,
  "supported_resolutions": ["1", "3", "5", "15", "30", "60", "120", "240", "D", "W", "M"],
  "data_status": "streaming"
}
```

The server will automatically detect and serve the new symbol.

## Time Format

- **Request timestamps**: Unix time in seconds
- **Internal timestamps**: Unix time in milliseconds
- **Response timestamps**: Unix time in seconds

## Response Codes

- `200` - Successful request
- `400` - Invalid parameters
- `404` - Symbol or data not found
- `500` - Server error

## Preventing Infinite Requests

The server now correctly handles data boundaries to prevent TradingView from making infinite requests:

1. **Proper no_data responses**: When requested time range has no data, the server returns `{"s": "no_data", "nextTime": null}` instead of fallback data
2. **Time boundary detection**: The server checks if requested range is before or after available data and responds appropriately
3. **Correct resolution format**: Uses numeric values for minutes (e.g., `60` for 1 hour) instead of suffixed format (e.g., `1h`)
4. **No fallback data**: Removed the fallback mechanism that returned last 100 bars when no data was found in range

## Error Responses

### No Data Available
```json
{
  "s": "no_data",
  "nextTime": null
}
```

### Error Response
```json
{
  "s": "error",
  "errmsg": "Error description"
}
```

## Integration with TradingView

To use this server with TradingView charts:

1. In TradingView's Lightweight Charts, configure the datafeed with your server URL
2. Reference this server as the UDF data source
3. All symbols defined in `symbols.json` will be available

## Project Structure

```
tradingview-udf-server/
├── server.js              # Main Express server
├── symbols.json           # Symbol configuration
├── package.json           # Dependencies
├── data/
│   ├── BTCUSDT.json      # Bitcoin data
│   ├── XAUUSD.json       # Gold data
│   └── NIFTY.json        # Nifty index data
└── README.md             # This file
```

## Dependencies

- `express` - Web framework
- `cors` - Cross-Origin Resource Sharing middleware

## Configuration

Server port can be set via environment variable:

```bash
PORT=8080 npm start
```

## Notes

- All data is served directly from JSON files
- Time ranges should use Unix timestamps in seconds
- The server uses real OHLCV data (no demo data)
- Data files are loaded on-demand for efficiency

## License

MIT

## Support

For issues or questions, please refer to the TradingView UDF documentation or examine the API endpoint responses.
