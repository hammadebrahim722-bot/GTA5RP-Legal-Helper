namespace LegalHelper.Models;

public record AskRequest(string Project, string Server, string Mode, string Question);
public record AskResponse(string Answer, string[] Sources);
public record VersionInfo(string Version, string? DownloadUrl);
public record ProjectCatalog(string Name, string Home, string RulesIndex, string[] Servers);
public record CatalogResponse(string Version, Dictionary<string, ProjectCatalog> Projects);
