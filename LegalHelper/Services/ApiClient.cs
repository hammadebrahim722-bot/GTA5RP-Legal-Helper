using System;
using System.Net.Http;
using System.Net.Http.Json;
using LegalHelper.Models;

namespace LegalHelper.Services;

public sealed class ApiClient
{
private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(90) };
public string BaseUrl { get; } = AppConfig.ApiBase.TrimEnd('/');

```
public async Task<AskResponse> AskAsync(AskRequest request, CancellationToken ct = default)
{
    var response = await _http.PostAsJsonAsync($"{BaseUrl}/api/ask", request, ct);

    if (!response.IsSuccessStatusCode)
    {
        var body = await response.Content.ReadAsStringAsync(ct);
        throw new HttpRequestException($"HTTP {(int)response.StatusCode}: {body}");
    }

    return await response.Content.ReadFromJsonAsync<AskResponse>(cancellationToken: ct)
           ?? new AskResponse("Пустой ответ.", Array.Empty<string>());
}

public async Task<VersionInfo?> GetVersionAsync(CancellationToken ct = default)
{
    try
    {
        return await _http.GetFromJsonAsync<VersionInfo>(
            $"{BaseUrl}/api/version",
            ct);
    }
    catch
    {
        return null;
    }
}

public async Task<CatalogResponse?> GetCatalogAsync(CancellationToken ct = default)
{
    try
    {
        return await _http.GetFromJsonAsync<CatalogResponse>(
            $"{BaseUrl}/api/catalog",
            ct);
    }
    catch
    {
        return null;
    }
}
```

}
