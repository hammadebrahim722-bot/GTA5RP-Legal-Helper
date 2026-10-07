@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo GTA 5 RP Legal Helper - Windows build
 echo ================================================
where dotnet >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: .NET 8 SDK not found.
  echo Install .NET 8 SDK and run this file again.
  pause
  exit /b 1
)

echo.
echo [1/2] Restoring packages...
dotnet restore LegalHelper\LegalHelper.csproj
if errorlevel 1 goto :fail

echo.
echo [2/2] Publishing self-contained EXE...
dotnet publish LegalHelper\LegalHelper.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true
if errorlevel 1 goto :fail

echo.
echo SUCCESS.
echo EXE folder:
echo LegalHelper\bin\Release\net8.0-windows\win-x64\publish\
explorer "LegalHelper\bin\Release\net8.0-windows\win-x64\publish"
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. Read the error above.
pause
exit /b 1
