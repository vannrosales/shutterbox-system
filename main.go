package main

import (
	"embed"
	"io/fs"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:dist
var assets embed.FS

func main() {
	app := NewApp()

	assetsSub, err := fs.Sub(assets, "dist")
	if err != nil {
		println("Error extracting assets subfolder:", err.Error())
		assetsSub = assets
	}

	err = wails.Run(&options.App{
		Title:                    "Shutterbox POS & Photo Booth Management System",
		Width:                    1280,
		Height:                   820,
		MinWidth:                 1024,
		MinHeight:                700,
		DisableResize:            false,
		Fullscreen:               false,
		Frameless:                false,
		StartHidden:              false,
		HideWindowOnClose:        false,
		BackgroundColour:         &options.RGBA{R: 15, G: 15, B: 15, A: 255},
		EnableDefaultContextMenu: true,
		AssetServer: &assetserver.Options{
			Assets: assetsSub,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			BackdropType:         windows.Mica,
			Theme:                windows.Dark,
		},
	})

	if err != nil {
		println("Error starting Shutterbox application:", err.Error())
	}
}
