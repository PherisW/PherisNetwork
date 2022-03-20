// https://glances.readthedocs.io/en/latest/api.html

class Glances {
    doFetch(args, endpoint) {
        return args.fetch({
            url: `api/3/` + endpoint,
            timeout: 10
        });
    }

    async status(args) {
        let mode = args.properties['mode'] || (
                        args.size === 'large' ? 'cpu' : 
                        args.size === 'x-large' ? 'overview' : 
                        args.size === 'xx-large' ? 'overview' : 
                        'basic'
                   );

        if(mode === 'overview')                   
            return await this.systemInfo(args);
        if(mode === 'basic')
            return await this.liveStats(args);
            
        return await this.chart(args, mode);
    }

    async systemInfo(args){
        const [ cpu, memory, fileSystem, gpu, uptime ] = await Promise.all([
          await this.doFetch(args, 'cpu'),
          await this.doFetch(args, 'mem'),
          await this.doFetch(args, 'fs'),
          await this.doFetch(args, 'gpu'),
          await this.doFetch(args, 'uptime'),
        ]);

        let items = [];

        if(args.properties['showUpTime'] !== false)
        {
            items.push({
                label:'Up Time', value: uptime
            });
        }

              // cpu 
        // {"interrupts": 861015, "system": 1.6, "time_since_update": 33.861000061035156, "idle": 90.8, "dpc": 0.1, "user": 7.4, 
        // "syscalls": 1358165, "interrupt": 0.1, "cpucore": 16, "total": 9.2, "soft_interrupts": 0, "ctx_switches": 921648}        
        items.push({
            label:'CPU', 
            percent: cpu?.total || 0, 
            tooltip: (cpu?.total || 0) + '% CPU Used',
            icon: '/common/cpu.svg'
        });
        // ram
        // {"available": 31510020096, "total": 68659789824, "percent": 54.1, "free": 31510020096, "used": 37149769728}
        if(!memory?.total)
            return;
        items.push({
            label:'RAM', 
            percent:memory.percent,             
            tooltip: memory.percent + '% Memory Used',
            icon: '/common/ram.svg'
        });

        if(gpu?.length)
        {
            for(let g of gpu)
            {
                items.push({
                    label: g.name, 
                    percent: g.mem, 
                    tooltip: g.mem.toFixed(1) + '% Memory Used',
                    icon: '/common/gpu.svg'
                 });
            }
        }

        if(fileSystem?.length){
            let keys = [];
            let drives = [];
            let filter = args.properties['driveFilter'];
            filter = new RegExp(filter ?? '.*', 'i'); 

            for(let fs of fileSystem)
            {
                if(filter.test(fs.mnt_point) === false)
                    continue;

                let key = fs.size + '|' + fs.used + '|' + fs.free;
                if(keys.indexOf(key) >= 0)
                    continue;
                keys.push(key);

                if(args.properties['groupDrives'])
                {
                    if(!drives.length)
                        drives.push({ mnt_point: 'Storage', free: 0, size: 0, percent: 0});
                    drives[0].free += fs.free;
                    drives[0].size += fs.size;
                    drives[0].percent = (((drives[0].size - drives[0].free) / drives[0].size) * 100);
                }
                else
                {
                    drives.push(fs);
                }
            }

            for(let drive of drives){
                items.push({
                    label: drive.mnt_point,
                    percent: drive.percent,
                    tooltip: args.Utils.formatBytes(drives[0].free) + ' Free',
                    icon: '/common/hdd.svg'
                });
            }
        }
        return args.barInfo(items);
    }

    async chart(args, mode) 
    {
        let chartType = mode;
        switch(chartType){
            case 'cpu': return await this.chartCpu(args);
            case 'ram': return await this.chartGeneric(args, 'mem', (value) => value + ' %');
            default: return await this.chartGeneric(args, chartType);
        }
    }

    async chartCpu(args)
    {        
        let cpuStats = await this.doFetch(args, 'cpu/history/50');
        if(!cpuStats?.system || !cpuStats?.user)
            return;
        
        let labels = cpuStats.system.map(x => new Date(x[0]));
        let data = [
            cpuStats.system.map(x => x[1]),
            cpuStats.user.map(x => x[1])
        ];
        let title = (cpuStats.system.at(-1)[1] + cpuStats.user.at(-1)[1]).toFixed(0) + ' %';

          return await args.chart.line({
            title,
            labels,
            data
          });
    }

    
    async chartGeneric(args, endpoint, titleFormatter)
    {        
        let stats = await this.doFetch(args, endpoint + '/history/50');
        if(!stats)
            return;
        let key = Object.keys(stats)[0];
        if(!key || !stats[key])
            return;

        
        let labels = stats[key].map(x => new Date(x[0]));
        let data = [
            stats[key].map(x => x[1]),
        ];
        let title = stats[key].at(-1)[1];
        if(titleFormatter)
            title = titleFormatter(title);

        return await args.chart.line({
            title,
            labels,
            data
        });
    }

    async liveStats(args) 
    {        

        let firstQuery = args.properties['firstStatQuery'] || 'cpu/total';
        let secondQuery = args.properties['secStatQuery'] || 'mem/percent';
        let firstTitle = args.properties['firstStatTitle'] || 'CPU';
        let secondTitle = args.properties['secStatTitle'] || 'RAM';

        let firstQueryValue = firstQuery.split(/[/]+/).pop();
        let secondQueryValue = secondQuery.split(/[/]+/).pop();

        const [ first, second ] = await Promise.all([
            await this.doFetch(args, firstQuery),
            await this.doFetch(args, secondQuery)
        ]);

        if(!first || !second)
            return;
        
        let firstQueryResult = first[firstQueryValue];
        let secondQueryResult = second[secondQueryValue];

        return args.liveStats([
            [firstTitle, firstQueryResult],
            [secondTitle, secondQueryResult]
        ]);
    }

    async test(args) {
        let data = await this.doFetch(args, 'cpu');
        console.log('data', data);
        return isNaN(data?.total) === false;
    }
}

module.exports = Glances;
