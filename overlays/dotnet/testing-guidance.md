# ASP.NET Core -- Testing Guidance

> Stack overlay for the Test Engineer. This supplements the generic role with ASP.NET Core-specific testing patterns, setup, and conventions.

---

## Test Stack

.NET projects in this team use:
- **xUnit** as the test framework (Fact, Theory)
- **WebApplicationFactory** for API integration tests (in-process HTTP testing)
- **Playwright for .NET** for E2E browser tests
- **FluentAssertions** for readable assertions (if installed)

---

## Project Structure

```
tests/
  MyApp.Tests/
    MyApp.Tests.csproj
    Api/
      TasksApiTests.cs          -- API integration tests
      AuthApiTests.cs           -- Authentication tests
    E2E/
      TaskCrudTests.cs          -- Browser workflow tests
      XssPreventionTests.cs     -- XSS security tests
      StylingTests.cs           -- Visual/layout tests
    Fixtures/
      CustomWebApplicationFactory.cs  -- Test server factory
    evidence/                   -- Screenshots
    report/                     -- HTML evidence report
```

### Test Project Dependencies

```xml
<ItemGroup>
  <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" />
  <PackageReference Include="Microsoft.Playwright" />
  <PackageReference Include="xunit" />
  <PackageReference Include="xunit.runner.visualstudio" />
  <PackageReference Include="FluentAssertions" />
</ItemGroup>
<ItemGroup>
  <ProjectReference Include="..\..\src\MyApp.Api\MyApp.Api.csproj" />
</ItemGroup>
```

---

## API Integration Tests with WebApplicationFactory

### Custom Factory

```csharp
public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            // Replace real database with in-memory for tests
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (descriptor != null) services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(options =>
                options.UseInMemoryDatabase("TestDb"));
        });
    }
}
```

**Critical**: The application must have `public partial class Program { }` at the bottom of `Program.cs` for the factory to reference it.

### Writing API Tests

```csharp
public class TasksApiTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public TasksApiTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task AC1_CreateTask_WithValidTitle_Returns201()
    {
        // Arrange
        var token = await GetAuthToken();
        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        var payload = new { title = "Test task" };

        // Act
        var response = await _client.PostAsJsonAsync("/api/tasks", payload);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        body.GetProperty("id").GetString().Should().NotBeNullOrEmpty();
        body.GetProperty("title").GetString().Should().Be("Test task");
    }

    [Fact]
    public async Task AC1_CreateTask_WithEmptyTitle_Returns400()
    {
        var token = await GetAuthToken();
        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        var payload = new { title = "" };

        var response = await _client.PostAsJsonAsync("/api/tasks", payload);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    private async Task<string> GetAuthToken()
    {
        var loginPayload = new { username = "testuser", password = "testpass" };
        var response = await _client.PostAsJsonAsync("/api/auth/token", loginPayload);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("token").GetString()!;
    }
}
```

### Theory for Parameterized Tests

```csharp
[Theory]
[InlineData("")]
[InlineData("   ")]
[InlineData(null)]
public async Task AC1_CreateTask_WithInvalidTitle_Returns400(string? title)
{
    var token = await GetAuthToken();
    _client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue("Bearer", token);

    var payload = new { title };
    var response = await _client.PostAsJsonAsync("/api/tasks", payload);

    response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
}
```

### Adversarial Input Tests

```csharp
[Fact]
public async Task AC6_CreateTask_WithXssPayload_SanitizesOutput()
{
    var token = await GetAuthToken();
    _client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue("Bearer", token);

    var payload = new { title = "<script>alert('xss')</script>" };
    var response = await _client.PostAsJsonAsync("/api/tasks", payload);
    var body = await response.Content.ReadFromJsonAsync<JsonElement>();

    response.StatusCode.Should().Be(HttpStatusCode.Created);
    body.GetProperty("title").GetString().Should().NotContain("<script>");
}

[Fact]
public async Task AC5_CreateTask_WithSqlInjection_HandlesSafely()
{
    var token = await GetAuthToken();
    _client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue("Bearer", token);

    var payload = new { title = "'; DROP TABLE Tasks; --" };
    var response = await _client.PostAsJsonAsync("/api/tasks", payload);

    // Should create or reject, not crash
    new[] { HttpStatusCode.Created, HttpStatusCode.BadRequest }
        .Should().Contain(response.StatusCode);
}
```

---

## E2E Testing with Playwright for .NET

### Setup

Install Playwright browsers after adding the NuGet package:

```bash
pwsh bin/Debug/net8.0/playwright.ps1 install
```

### E2E Test Pattern

```csharp
public class TaskCrudTests : IAsyncLifetime
{
    private IBrowser _browser = null!;
    private IPage _page = null!;

    public async Task InitializeAsync()
    {
        var playwright = await Playwright.CreateAsync();
        _browser = await playwright.Chromium.LaunchAsync();
        _page = await _browser.NewPageAsync();
    }

    public async Task DisposeAsync()
    {
        await _browser.DisposeAsync();
    }

    [Fact]
    public async Task AC2_TaskList_DisplaysOnPageLoad()
    {
        await _page.GotoAsync("http://localhost:5000");
        await _page.WaitForSelectorAsync("[data-testid='task-list']",
            new() { State = WaitForSelectorState.Visible });

        var tasks = _page.Locator("[data-testid='task-item']");
        (await tasks.CountAsync()).Should().BeGreaterThan(0);

        await _page.ScreenshotAsync(new()
        {
            Path = "tests/evidence/ac2-task-list-rendered.png"
        });
    }
}
```

### Screenshot Pattern

Assert before capturing:

```csharp
// CORRECT
var modal = _page.Locator("[data-testid='confirm-dialog']");
await Expect(modal).ToBeVisibleAsync();
await _page.ScreenshotAsync(new() { Path = "tests/evidence/ac4-modal.png" });

// WRONG -- screenshot without assertion
await _page.ScreenshotAsync(new() { Path = "tests/evidence/ac4-modal.png" });
```

---

## Test Lifecycle

### IClassFixture (shared per test class)

Use for expensive setup like `WebApplicationFactory`:

```csharp
public class TasksApiTests : IClassFixture<CustomWebApplicationFactory>
{
    public TasksApiTests(CustomWebApplicationFactory factory) { ... }
}
```

### IAsyncLifetime (async setup/teardown per test)

Use when you need async `InitializeAsync` and `DisposeAsync`:

```csharp
public class BrowserTests : IAsyncLifetime
{
    public async Task InitializeAsync() { /* launch browser */ }
    public async Task DisposeAsync() { /* close browser */ }
}
```

### Collection Fixtures (shared across classes)

Use when multiple test classes need the same expensive resource:

```csharp
[CollectionDefinition("Server")]
public class ServerCollection : ICollectionFixture<CustomWebApplicationFactory> { }

[Collection("Server")]
public class TasksApiTests { ... }
```

---

## Assertions

### xUnit Built-in

```csharp
Assert.Equal(HttpStatusCode.Created, response.StatusCode);
Assert.NotNull(body.GetProperty("id").GetString());
Assert.Contains("error", body.ToString());
```

### FluentAssertions (preferred for readability)

```csharp
response.StatusCode.Should().Be(HttpStatusCode.Created);
body.GetProperty("id").GetString().Should().NotBeNullOrEmpty();
body.GetProperty("title").GetString().Should().Be("Expected title");
```

### Playwright Assertions

```csharp
await Expect(_page.Locator("#title")).ToBeVisibleAsync();
await Expect(_page.Locator("#title")).ToHaveTextAsync("Expected Title");
await Expect(_page.Locator(".item")).ToHaveCountAsync(3);
```

---

## Mocking

### Moq

```csharp
var mockService = new Mock<ITaskService>();
mockService.Setup(s => s.GetAll()).Returns(new List<TaskItem>());

// Register in WebApplicationFactory
builder.ConfigureServices(services =>
{
    services.AddScoped(_ => mockService.Object);
});
```

### NSubstitute

```csharp
var taskService = Substitute.For<ITaskService>();
taskService.GetAll().Returns(new List<TaskItem>());
```

---

## Running Tests

```bash
# Run all tests
dotnet test

# Run specific test class
dotnet test --filter "FullyQualifiedName~TasksApiTests"

# Run tests with specific name pattern
dotnet test --filter "AC1"

# Verbose output
dotnet test --verbosity detailed

# Generate test results
dotnet test --logger "trx;LogFileName=results.trx"
```

---

## Common Gotchas

1. **WebApplicationFactory requires `public partial class Program`** -- Without this, the factory cannot find the entry point
2. **Port conflicts with E2E tests** -- Use `WebApplicationFactory` for API tests (no port needed) and only start a real server for E2E tests
3. **Shared state in in-memory databases** -- Use unique database names per test class or reset data in setup
4. **JSON deserialization** -- `ReadFromJsonAsync<JsonElement>()` is the safest option when the shape may vary (errors vs. success)
5. **Playwright browser installation** -- Must run `playwright.ps1 install` after NuGet restore
6. **Async test methods** -- All xUnit test methods using async operations must return `Task`, not `void`
7. **Test naming** -- Use `AC{N}_{Method}_{Scenario}_{ExpectedResult}` pattern for traceability: `AC1_CreateTask_WithValidTitle_Returns201`
