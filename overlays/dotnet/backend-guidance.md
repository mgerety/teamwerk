# ASP.NET Core -- Backend Build Guidance

> Stack overlay for the Backend Builder. This supplements the generic role with ASP.NET Core-specific patterns, conventions, and gotchas.

---

## Project Structure

```
MyApp/
  MyApp.sln                     -- Solution file
  src/
    MyApp.Api/
      MyApp.Api.csproj          -- Project file
      Program.cs                -- Entry point, host builder, middleware pipeline
      Controllers/
        TasksController.cs      -- API controller for tasks resource
        AuthController.cs       -- Authentication endpoints
      Services/
        TaskService.cs          -- Business logic
        ITaskService.cs         -- Service interface for DI
      Models/
        Task.cs                 -- Domain model
        CreateTaskRequest.cs    -- Request DTO with validation attributes
        TaskResponse.cs         -- Response DTO
      Middleware/
        ExceptionHandlerMiddleware.cs
      Data/
        AppDbContext.cs          -- EF Core DbContext (if using a database)
        InMemoryStore.cs         -- In-memory data store (for spikes)
  tests/
    MyApp.Tests/
      MyApp.Tests.csproj
      Api/                      -- Integration tests
      E2E/                      -- Playwright E2E tests
```

---

## Program.cs (Minimal API Host)

Modern ASP.NET Core uses the minimal hosting model in `Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);

// Register services
builder.Services.AddControllers();
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options => { /* configure JWT */ });

var app = builder.Build();

// Middleware pipeline -- ORDER MATTERS
app.UseExceptionHandler("/error");
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

### Testability: Expose the App for WebApplicationFactory

Add this partial class declaration at the bottom of `Program.cs` so integration tests can reference it:

```csharp
// At the bottom of Program.cs
public partial class Program { }
```

This is the .NET equivalent of Express's `module.exports = app`.

---

## Controllers

### API Controller Pattern

```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TasksController : ControllerBase
{
    private readonly ITaskService _taskService;

    public TasksController(ITaskService taskService)
    {
        _taskService = taskService;
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        var tasks = _taskService.GetAll();
        return Ok(tasks);
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateTaskRequest request)
    {
        var task = _taskService.Create(request);
        return CreatedAtAction(nameof(GetById), new { id = task.Id }, task);
    }

    [HttpGet("{id}")]
    public IActionResult GetById(string id)
    {
        var task = _taskService.GetById(id);
        if (task == null) return NotFound(new { error = "Task not found" });
        return Ok(task);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        var deleted = _taskService.Delete(id);
        if (!deleted) return NotFound(new { error = "Task not found" });
        return NoContent();
    }
}
```

**Key conventions:**
- `[ApiController]` enables automatic model validation and 400 responses
- `[Route("api/[controller]")]` uses the controller name minus "Controller" suffix
- Return `IActionResult` for flexibility in status codes
- Use `[Authorize]` at class or method level

---

## Dependency Injection

Register services in `Program.cs`:

```csharp
// Scoped -- one instance per HTTP request (most common for services)
builder.Services.AddScoped<ITaskService, TaskService>();

// Singleton -- one instance for the application lifetime (in-memory stores)
builder.Services.AddSingleton<InMemoryStore>();

// Transient -- new instance every time it is requested
builder.Services.AddTransient<IValidator, TaskValidator>();
```

**Gotcha**: Do NOT inject Scoped services into Singleton services. This causes the scoped service to behave as a singleton, which can create concurrency bugs.

---

## Input Validation

### DataAnnotations (built-in)

```csharp
public class CreateTaskRequest
{
    [Required(ErrorMessage = "Title is required")]
    [StringLength(200, ErrorMessage = "Title must be 200 characters or fewer")]
    public string Title { get; set; }

    [StringLength(2000)]
    public string? Description { get; set; }
}
```

With `[ApiController]`, invalid models automatically return 400 with a ProblemDetails response. To customize the error format:

```csharp
builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var firstError = context.ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .FirstOrDefault();
            return new BadRequestObjectResult(new { error = firstError });
        };
    });
```

### FluentValidation (alternative)

```csharp
public class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Title is required")
            .MaximumLength(200).WithMessage("Title must be 200 characters or fewer");
    }
}
```

---

## Authentication

### JWT Bearer

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"] ?? "dev-secret-key-min-32-chars!!")),
            ValidateIssuer = false,
            ValidateAudience = false,
            ClockSkew = TimeSpan.Zero
        };
    });
```

### Token Endpoint

```csharp
[AllowAnonymous]
[HttpPost("token")]
public IActionResult GetToken([FromBody] LoginRequest request)
{
    // Validate credentials...
    var token = new JwtSecurityTokenHandler().WriteToken(
        new JwtSecurityToken(
            claims: new[] { new Claim(ClaimTypes.Name, request.Username) },
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret)),
                SecurityAlgorithms.HmacSha256)
        ));

    return Ok(new { token });
}
```

---

## Error Handling

### Centralized Exception Handler

```csharp
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.ContentType = "application/json";
        context.Response.StatusCode = 500;
        await context.Response.WriteAsJsonAsync(new { error = "Internal server error" });
    });
});
```

### ProblemDetails (standard format)

```csharp
builder.Services.AddProblemDetails();
```

This returns RFC 7807 compliant error responses. Override if the project requires a simpler `{ error: "..." }` format.

---

## Security

### HTML Sanitization

```csharp
using System.Net;

public static string SanitizeHtml(string input)
{
    if (string.IsNullOrEmpty(input)) return input;
    return WebUtility.HtmlEncode(input);
}
```

Apply to all user-provided string fields before storing.

### Security Headers

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    await next();
});
```

---

## Static Files and SPA Hosting

```csharp
app.UseStaticFiles(); // Serves from wwwroot/ by default

// SPA fallback -- after API routes
app.MapFallbackToFile("index.html");
```

To serve from a different directory:

```csharp
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(
        Path.Combine(builder.Environment.ContentRootPath, "public")),
    RequestPath = ""
});
```

---

## Entity Framework Core (if using a database)

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=app.db"));
```

Migrations:
```bash
dotnet ef migrations add InitialCreate
dotnet ef database update
```

For spike projects, prefer an in-memory store over a full database setup.

---

## Blazor-Specific Patterns (if applicable)

- Components live in `Components/` or `Pages/`
- Use `@inject` for DI in components
- Use `NavigationManager` for routing
- State management: cascading parameters, or inject a scoped state service

## MAUI-Specific Patterns (if applicable)

- Follow MVVM: Views in `Views/`, ViewModels in `ViewModels/`
- Use Shell navigation: `Shell.Current.GoToAsync("route")`
- Platform-specific code in `Platforms/` directory
- Use `CommunityToolkit.Mvvm` for `[ObservableProperty]` and `[RelayCommand]`

---

## Common Gotchas

1. **Middleware order** -- `UseAuthentication()` must come before `UseAuthorization()`, and both before `MapControllers()`
2. **Nullable reference types** -- Modern .NET enables NRT by default. Use `string?` for optional fields to avoid warnings
3. **JSON serialization** -- System.Text.Json is the default. It is case-sensitive by default, so configure `PropertyNameCaseInsensitive = true` for incoming requests if needed
4. **Async controllers** -- Return `Task<IActionResult>` and `await` async operations. Do not use `.Result` or `.Wait()` -- this causes deadlocks
5. **Port configuration** -- Set via `ASPNETCORE_URLS` environment variable or in `launchSettings.json`
6. **CORS** -- Must be configured with `AddCors()` and `UseCors()` if frontend is on a different origin
