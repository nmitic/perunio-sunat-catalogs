// Command gensunat renders catalogs/*.json into the sunat package.
//
// Deep validation lives in ../../validate.mjs, which `npm run gen` and `npm run
// check` run first. The checks here are the minimum needed to fail loudly rather
// than emit nonsense when run on its own.
//
// Usage:
//
//	go run ./tools/gensunat            write sunat/*.go
//	go run ./tools/gensunat --check    diff against disk, exit 1 on any difference
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
)

const outDir = "sunat"

type entry struct {
	Code         string          `json:"code"`
	Label        string          `json:"label"`
	Description  string          `json:"description"`
	Capabilities []string        `json:"capabilities"`
	Flags        map[string]bool `json:"flags"`
	Props        map[string]any  `json:"props"`
	GoName       string          `json:"goName"`
}

type catalog struct {
	ID           string            `json:"id"`
	SunatCatalog *string           `json:"sunatCatalog"`
	Name         string            `json:"name"`
	Source       string            `json:"source"`
	CodePattern  string            `json:"codePattern"`
	GoConsts     *bool             `json:"goConsts"`
	PropRefs     map[string]string `json:"propRefs"`
	Entries      []entry           `json:"entries"`

	flagKeys []string
	propKeys []string
	caps     []string
}

// goNames reports whether this catalog emits one named constant per entry.
// Large reference datasets (ubigeo) set goConsts:false — 1874 constants would be
// noise, and nothing refers to a district by name.
func (c *catalog) goNames() bool { return c.GoConsts == nil || *c.GoConsts }

func main() {
	if err := run(slices.Contains(os.Args[1:], "--check")); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(check bool) error {
	root, err := repoRoot()
	if err != nil {
		return err
	}

	catalogs, err := loadCatalogs(filepath.Join(root, "catalogs"))
	if err != nil {
		return err
	}

	rendered := map[string][]byte{}
	doc, err := renderDoc(catalogs)
	if err != nil {
		return err
	}
	rendered["doc.go"] = doc
	for _, c := range catalogs {
		b, err := renderCatalog(c)
		if err != nil {
			return fmt.Errorf("%s: %w", c.ID, err)
		}
		rendered[c.ID+".go"] = b
	}

	dir := filepath.Join(root, outDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	existing, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var orphans []string
	for _, e := range existing {
		if !strings.HasSuffix(e.Name(), ".go") {
			continue
		}
		if _, ok := rendered[e.Name()]; !ok {
			orphans = append(orphans, e.Name())
		}
	}

	if check {
		var problems []string
		for name, want := range rendered {
			got, err := os.ReadFile(filepath.Join(dir, name))
			if err != nil {
				problems = append(problems, fmt.Sprintf("%s/%s: missing", outDir, name))
				continue
			}
			if !bytes.Equal(got, want) {
				problems = append(problems, fmt.Sprintf("%s/%s: differs at %s", outDir, name, firstDiff(got, want)))
			}
		}
		for _, name := range orphans {
			problems = append(problems, fmt.Sprintf("%s/%s: not produced by the generator — delete it", outDir, name))
		}
		if len(problems) > 0 {
			sort.Strings(problems)
			return fmt.Errorf("generated output is stale:\n  %s\n\nRun: npm run gen", strings.Join(problems, "\n  "))
		}
		fmt.Printf("ok — %d generated file(s) match the spec\n", len(rendered))
		return nil
	}

	var written int
	for name, content := range rendered {
		path := filepath.Join(dir, name)
		// Only touch files that changed, so mtimes stay stable for the build cache.
		if got, err := os.ReadFile(path); err == nil && bytes.Equal(got, content) {
			continue
		}
		if err := os.WriteFile(path, content, 0o644); err != nil {
			return err
		}
		written++
	}
	for _, name := range orphans {
		fmt.Fprintf(os.Stderr, "warning: %s/%s is not produced by the generator — delete it\n", outDir, name)
	}
	fmt.Printf("ok — %d file(s), %d written\n", len(rendered), written)
	return nil
}

// repoRoot walks up from the working directory to the module root, so the
// command works from anywhere in the repo.
func repoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("gensunat: no go.mod found above %s", dir)
		}
		dir = parent
	}
}

func loadCatalogs(dir string) ([]*catalog, error) {
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var catalogs []*catalog
	byID := map[string]*catalog{}
	for _, f := range files {
		if !strings.HasSuffix(f.Name(), ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, f.Name()))
		if err != nil {
			return nil, err
		}
		c := &catalog{}
		if err := json.Unmarshal(b, c); err != nil {
			return nil, fmt.Errorf("catalogs/%s: %w", f.Name(), err)
		}
		if err := c.prepare(); err != nil {
			return nil, fmt.Errorf("catalogs/%s: %w", f.Name(), err)
		}
		catalogs = append(catalogs, c)
		byID[c.ID] = c
	}
	sort.Slice(catalogs, func(i, j int) bool { return catalogs[i].ID < catalogs[j].ID })

	for _, c := range catalogs {
		for prop, target := range c.PropRefs {
			if _, ok := byID[target]; !ok {
				return nil, fmt.Errorf("%s: propRefs.%s points at unknown catalog %q", c.ID, prop, target)
			}
		}
	}
	return catalogs, nil
}

// prepare derives the sorted key sets the renderer needs and checks the little
// that must hold for rendering to make sense at all.
func (c *catalog) prepare() error {
	if c.ID == "" || len(c.Entries) == 0 {
		return fmt.Errorf("id and entries are required")
	}

	seen := map[string]bool{}
	caps := map[string]bool{}
	for _, e := range c.Entries {
		if e.Code == "" {
			return fmt.Errorf("entry: code is required")
		}
		if e.GoName == "" && c.goNames() {
			return fmt.Errorf("entry %q: goName is required unless goConsts is false", e.Code)
		}
		if seen[e.Code] {
			return fmt.Errorf("duplicate code %q", e.Code)
		}
		seen[e.Code] = true
		for _, cap := range e.Capabilities {
			caps[cap] = true
		}
	}

	// The first entry defines the shape; validate.mjs enforces that the rest match.
	for k := range c.Entries[0].Flags {
		c.flagKeys = append(c.flagKeys, k)
	}
	for k := range c.Entries[0].Props {
		c.propKeys = append(c.propKeys, k)
	}
	for k := range caps {
		c.caps = append(c.caps, k)
	}
	sort.Strings(c.flagKeys)
	sort.Strings(c.propKeys)
	sort.Strings(c.caps)
	return nil
}

func firstDiff(got, want []byte) string {
	g := strings.Split(string(got), "\n")
	w := strings.Split(string(want), "\n")
	for i := range max(len(g), len(w)) {
		gl, wl := "", ""
		if i < len(g) {
			gl = g[i]
		}
		if i < len(w) {
			wl = w[i]
		}
		if gl != wl {
			return fmt.Sprintf("line %d\n      on disk:  %s\n      expected: %s", i+1, gl, wl)
		}
	}
	return "end of file"
}

func gofmt(b *bytes.Buffer) ([]byte, error) {
	out, err := format.Source(b.Bytes())
	if err != nil {
		return nil, fmt.Errorf("generated code does not parse: %w\n%s", err, b.String())
	}
	return out, nil
}
