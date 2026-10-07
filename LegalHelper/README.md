# Клиент

Перед `dotnet publish` укажи URL Worker в `Services/AppConfig.cs`:

```csharp
public const string ApiBase = "https://твой-worker.workers.dev";
```

Игроки этот адрес не редактируют.
