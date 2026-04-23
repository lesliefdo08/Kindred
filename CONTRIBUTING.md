# Contributing to Kindred

Thank you for your interest in contributing to Kindred! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Be respectful and constructive in all interactions. We aim to maintain a welcoming community.

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/lesliefdo08/Kindred.git
   cd Kindred
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Run tests**
   ```bash
   npm run verify:core
   ```

5. **Build for production**
   ```bash
   npm run build
   ```

## Project Structure

- `src/` - React renderer components
- `electron/` - Electron main process and runtime managers
- `tests/` - Runtime and integration tests
- `resources/` - Bundled runtimes (TinyCC, etc.)
- `docs/` - Documentation

## Making Changes

### Before You Start
- Check existing issues to avoid duplicate work
- Discuss major changes in an issue first
- Follow the existing code style and patterns

### Code Style
- Use TypeScript for type safety
- Use React hooks for functional components
- Keep components small and focused
- Write self-documenting code with clear naming

### Testing
- Add tests for new features
- Run `npm run verify:core` before submitting
- Test manual workflows (open, save, run code)

### Commit Messages
- Use clear, descriptive commit messages
- Reference issues: `Fixes #123`
- Keep commits focused and logical

## Submitting Changes

1. **Fork the repository**
2. **Create a feature branch** - `git checkout -b feature/your-feature`
3. **Commit your changes** - Clear, descriptive commits
4. **Push to your fork** - `git push origin feature/your-feature`
5. **Open a Pull Request** - Include description of changes and motivation

## Pull Request Guidelines

- Provide a clear description of the problem and solution
- Reference related issues
- Include test coverage for new features
- Ensure all tests pass
- Update documentation if needed

## Reporting Issues

When reporting issues, include:
- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Node version, etc.)
- Screenshots or error messages if applicable

## Feature Requests

We welcome feature suggestions! Please describe:
- The feature and its use case
- How it fits with Kindred's vision (local-first, lightweight)
- Alternatives or workarounds you've considered

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue for questions or discussions about the project.

---

Thank you for helping make Kindred better!
